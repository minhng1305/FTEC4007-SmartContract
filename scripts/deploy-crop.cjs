const hre = require("hardhat");

async function main() {
  console.log("Deploying WeatherCropInsurance contract...");
  const WeatherCropInsurance = await hre.ethers.getContractFactory("WeatherCropInsurance");

  const insuranceContract = await WeatherCropInsurance.deploy();
  await insuranceContract.waitForDeployment();

  const contractAddress = await insuranceContract.getAddress();
  console.log(`WeatherCropInsurance deployed to: ${contractAddress}`);

  console.log("Funding the insurance pool with 50 ETH...");
  const fundingTx = await insuranceContract.fundInsurancePool({
    value: hre.ethers.parseEther("50.0")
  });
  await fundingTx.wait();

  const poolBalance = await insuranceContract.getPoolBalance();
  console.log(`Insurance pool funded. Current balance: ${hre.ethers.formatEther(poolBalance)} ETH`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});