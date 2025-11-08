const { expect } = require("chai");
const hre = require("hardhat");

describe("WeatherCropInsurance Contract", function () {
    let WeatherCropInsurance;
    let insuranceContract;
    let owner;
    let farmer1;

    // Policy details for testing
    const cropType = "Corn";
    const location = "Iowa";
    const startDate = "2024-07-01";
    const endDate = "2024-07-31";

    before(async function () {
        [owner, farmer1] = await hre.ethers.getSigners();
        WeatherCropInsurance = await hre.ethers.getContractFactory("WeatherCropInsurance");
        insuranceContract = await WeatherCropInsurance.deploy();
        await insuranceContract.waitForDeployment();

        // Pre-fund the pool for tests
        await insuranceContract.connect(owner).fundInsurancePool({ value: hre.ethers.parseEther("50") });
    });

    describe("Policy Management", function () {
        it("Should allow a farmer to create a crop policy", async function () {
        const premium = hre.ethers.parseEther("1");
        await expect(insuranceContract.connect(farmer1).createCropPolicy(cropType, location, startDate, endDate, { value: premium }))
            .to.emit(insuranceContract, "PolicyCreated")
            .withArgs(0, farmer1.address, cropType, startDate, endDate);

        const policy = await insuranceContract.getPolicyDetails(0);
        expect(policy.farmer).to.equal(farmer1.address);
        expect(policy.cropType).to.equal(cropType);
        expect(policy.isActive).to.be.true;
        });

        it("Should reject policies where start date is after end date", async function () {
        const premium = hre.ethers.parseEther("1");
        const badStartDate = "2024-08-01";
        const badEndDate = "2024-07-31";
        await expect(
            insuranceContract.connect(farmer1).createCropPolicy(cropType, location, badStartDate, badEndDate, { value: premium })
        ).to.be.revertedWith("Start date must be before or equal to end date");
        });
    });

    describe("Weather Data and Drought Claim", function () {
        const policyId = 0; // Using the policy created by farmer1

        it("Should allow owner to record weather data", async function () {
            await insuranceContract.connect(owner).recordWeatherData("2024-07-10", 2); // Dry day
            await insuranceContract.connect(owner).recordWeatherData("2024-07-11", 10); // Wet day
            await insuranceContract.connect(owner).recordWeatherData("2024-07-12", 3); // Dry day
            await insuranceContract.connect(owner).recordWeatherData("2024-07-13", 1); // Dry day
            await insuranceContract.connect(owner).recordWeatherData("2024-07-14", 4); // Dry day

            const weatherOnDate = await insuranceContract.getWeatherData("2024-07-10");
            expect(weatherOnDate.rainfallMM).to.equal(2);
        });

        it("Should NOT meet drought condition initially", async function () {
            // The counter has not been updated yet
            expect(await insuranceContract.isDroughtConditionMet(policyId)).to.be.false;
        });

        it("Should correctly update the consecutive dry days counter", async function () {
            await insuranceContract.connect(farmer1).updateDryDaysCounter(policyId);
            const dryDays = await insuranceContract.getConsecutiveDryDays(policyId);
            // The longest streak of dry days (rainfall < 5mm) is 3 (July 12, 13, 14)
            expect(dryDays).to.equal(3);
        });

        it("Should now meet the drought condition", async function () {
            // The default threshold is 3 days, and we have 3 consecutive dry days
            expect(await insuranceContract.isDroughtConditionMet(policyId)).to.be.true;
        });

        it("Should allow a valid farmer to claim drought compensation", async function () {
            const initialBalance = await hre.ethers.provider.getBalance(farmer1.address);
            const compensationAmount = await insuranceContract.compensationPerClaim();

            const tx = await insuranceContract.connect(farmer1).claimDroughtCompensation(policyId);
            const receipt = await tx.wait();
            const gasUsed = receipt.gasUsed * receipt.gasPrice;

            const finalBalance = await hre.ethers.provider.getBalance(farmer1.address);
            
            expect(finalBalance).to.equal(initialBalance + compensationAmount - gasUsed);

            const policy = await insuranceContract.getPolicyDetails(policyId);
            expect(policy.hasClaimedCompensation).to.be.true;
            expect(policy.isActive).to.be.false;
        });

        it("Should NOT allow claiming compensation twice", async function () {
            await expect(
                insuranceContract.connect(farmer1).claimDroughtCompensation(policyId)
            ).to.be.revertedWith("Policy is not active");
        });
    });
});