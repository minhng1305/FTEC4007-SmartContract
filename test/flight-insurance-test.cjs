const { expect } = require("chai");
const hre = require("hardhat");

describe("FlightDelayInsurance Contract", function () {
	let FlightDelayInsurance;
	let insuranceContract;
	let owner;
	let customer1;
	let customer2;

	// Flight details for testing
	const flightNumber = "BA2490";
	const departureDate = "2024-09-15";

	// Deploy the contract once before all tests
	before(async function () {
		[owner, customer1, customer2] = await hre.ethers.getSigners();
		FlightDelayInsurance = await hre.ethers.getContractFactory("FlightDelayInsurance");
		insuranceContract = await FlightDelayInsurance.deploy();
		await insuranceContract.waitForDeployment();
	});

	describe("Deployment and Funding", function () {
		it("Should set the right owner", async function () {
			expect(await insuranceContract.owner()).to.equal(owner.address);
		});

		it("Should have an initial pool balance of 0", async function () {
			expect(await insuranceContract.getPoolBalance()).to.equal(0);
		});

		it("Should allow the owner to fund the pool", async function () {
			const fundAmount = hre.ethers.parseEther("10");
			await expect(insuranceContract.connect(owner).fundInsurancePool({ value: fundAmount }))
				.to.emit(insuranceContract, "PoolFunded")
				.withArgs(owner.address, fundAmount);
			
			expect(await insuranceContract.getPoolBalance()).to.equal(fundAmount);
		});

		it("Should NOT allow non-owners to fund the pool", async function () {
			const fundAmount = hre.ethers.parseEther("1");
			await expect(
				insuranceContract.connect(customer1).fundInsurancePool({ value: fundAmount })
			).to.be.revertedWith("Only owner can call this function");
		});
	});

	describe("Policy Creation", function () {
		const premium = hre.ethers.parseEther("1");

		it("Should allow a customer to create a policy with the correct premium", async function () {
		const initialPoolBalance = await insuranceContract.getPoolBalance();
		
		await expect(insuranceContract.connect(customer1).createFlightPolicy(flightNumber, departureDate, { value: premium }))
			.to.emit(insuranceContract, "PolicyCreated")
			.withArgs(0, customer1.address, flightNumber, departureDate); // policyId is 0

		const policy = await insuranceContract.getPolicyDetails(0);
		expect(policy.policyholder).to.equal(customer1.address);
		expect(policy.flightNumber).to.equal(flightNumber);
		expect(policy.isActive).to.be.true;
		expect(policy.premiumPaid).to.equal(premium);

		// Check that the premium was added to the pool
		const newPoolBalance = await insuranceContract.getPoolBalance();
		expect(newPoolBalance).to.equal(initialPoolBalance + premium);
		});

		it("Should reject policy creation with incorrect premium", async function () {
			const wrongPremium = hre.ethers.parseEther("0.5");
			await expect(
				insuranceContract.connect(customer2).createFlightPolicy("LH123", "2024-10-10", { value: wrongPremium })
			).to.be.revertedWith("Premium must be exactly 1 ether");
		});
	});

	describe("Flight Delay and Compensation Claim", function () {
		const policyId = 0; // Using the policy created by customer1

		it("Should NOT allow a claim if flight is not delayed", async function () {
			await expect(
				insuranceContract.connect(customer1).claimCompensation(policyId)
			).to.be.revertedWith("Flight delay does not meet threshold");
		});

		it("Should allow owner to record a flight delay", async function () {
			const delayMinutes = 150; // 2.5 hours, which is >= 2 hours threshold
			await expect(insuranceContract.connect(owner).recordFlightDelay(flightNumber, departureDate, delayMinutes))
				.to.emit(insuranceContract, "DelayRecorded")
				.withArgs(flightNumber, departureDate, delayMinutes);

			expect(await insuranceContract.isFlightDelayed(flightNumber, departureDate)).to.be.true;
		});

		it("Should allow a valid policyholder to claim compensation after delay", async function () {
			const initialBalance = await hre.ethers.provider.getBalance(customer1.address);
			const compensationAmount = await insuranceContract.compensationAmount();

			const tx = await insuranceContract.connect(customer1).claimCompensation(policyId);
			const receipt = await tx.wait();
			const gasUsed = receipt.gasUsed * receipt.gasPrice;

			const finalBalance = await hre.ethers.provider.getBalance(customer1.address);
			
			expect(finalBalance).to.equal(initialBalance + compensationAmount - gasUsed);

			const policy = await insuranceContract.getPolicyDetails(policyId);
			expect(policy.hasClaimedCompensation).to.be.true;
			expect(policy.isActive).to.be.false;
		});

		it("Should NOT allow claiming compensation twice", async function () {
			await expect(
				insuranceContract.connect(customer1).claimCompensation(policyId)
			).to.be.revertedWith("Policy is not active");
		});

		it("Should NOT allow a non-policyholder to claim", async function () {
			const premium = hre.ethers.parseEther("1");
			const newFlight = "UA888";
			const newDate = "2024-12-01";
			
			// Create a new policy (this will have policyId 1)
			await insuranceContract.connect(customer1).createFlightPolicy(newFlight, newDate, { value: premium });

			// Record a delay for this new flight so the claim doesn't fail for that reason
			await insuranceContract.connect(owner).recordFlightDelay(newFlight, newDate, 180);

			// Now, have customer2 try to claim customer1's NEW, ACTIVE policy (policyId 1)
			const newPolicyId = 1; 
			await expect(
				insuranceContract.connect(customer2).claimCompensation(newPolicyId)
			).to.be.revertedWith("Only policyholder can claim");
		});
	});
});