const hre = require("hardhat");

async function main() {
  console.log("Deploying FlightDelayInsurance contract...");
  const FlightDelayInsurance = await hre.ethers.getContractFactory("FlightDelayInsurance");

  const insuranceContract = await FlightDelayInsurance.deploy();
  await insuranceContract.waitForDeployment(); // Wait for the deployment transaction to be mined

  const contractAddress = await insuranceContract.getAddress();
  console.log(`FlightDelayInsurance deployed to: ${contractAddress}`);

  console.log("Funding the insurance pool with 20 ETH...");
  const fundingTx = await insuranceContract.fundInsurancePool({
    value: hre.ethers.parseEther("20.0")
  });
  await fundingTx.wait(); // Wait for the funding transaction to be mined

  const poolBalance = await insuranceContract.getPoolBalance();
  console.log(`Insurance pool funded. Current balance: ${hre.ethers.formatEther(poolBalance)} ETH`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});