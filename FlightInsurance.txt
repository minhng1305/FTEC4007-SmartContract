// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract FlightDelayInsurance {
    
    address public owner;
    uint256 public insurancePoolBalance;
    uint256 public delayThresholdHours = 2;
    uint256 public compensationAmount = 5 ether;
    
    struct FlightPolicy {
        address policyholder;
        string flightNumber;
        string departureDate;
        bool isActive;
        bool hasClaimedCompensation;
        uint256 premiumPaid;
    }
    
    struct Customer {
        address customerAddress;
        uint256 totalPolicies;
        uint256 totalClaimed;
        bool exists;
    }
    
    mapping(uint256 => FlightPolicy) public flightPolicies;
    mapping(address => Customer) public customers;
    mapping(string => uint256) public flightDelayMinutes;
    
    uint256 public policyCounter = 0;
    
    event PolicyCreated(uint256 indexed policyId, address indexed policyholder, string flightNumber, string departureDate);
    event PremiumPaid(uint256 indexed policyId, address indexed policyholder, uint256 amount);
    event CompensationClaimed(uint256 indexed policyId, address indexed policyholder, uint256 compensationAmount, string reason);
    event DelayRecorded(string flightNumber, string departureDate, uint256 delayMinutes);
    event PoolFunded(address indexed funder, uint256 amount);
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this function");
        _;
    }
    
    modifier policyExists(uint256 _policyId) {
        require(_policyId < policyCounter, "Policy does not exist");
        _;
    }
    
    modifier policyActive(uint256 _policyId) {
        require(flightPolicies[_policyId].isActive, "Policy is not active");
        _;
    }
    
    constructor() {
        owner = msg.sender;
        insurancePoolBalance = 0;
    }
    
    function fundInsurancePool() external payable onlyOwner {
        require(msg.value > 0, "Must send Ether to fund pool");
        insurancePoolBalance += msg.value;
        emit PoolFunded(msg.sender, msg.value);
    }
    
    function getPoolBalance() external view returns (uint256) {
        return insurancePoolBalance;
    }
    
    function createFlightPolicy(
        string memory _flightNumber,
        string memory _departureDate
    ) external payable returns (uint256) {
        require(msg.value == 1 ether, "Premium must be exactly 1 ether");
        require(bytes(_flightNumber).length > 0, "Flight number cannot be empty");
        require(bytes(_departureDate).length > 0, "Departure date cannot be empty");
        
        uint256 policyId = policyCounter;
        flightPolicies[policyId] = FlightPolicy(
            msg.sender,
            _flightNumber,
            _departureDate,
            true,
            false,
            msg.value
        );
        
        if (!customers[msg.sender].exists) {
            customers[msg.sender] = Customer(msg.sender, 1, 0, true);
        } else {
            customers[msg.sender].totalPolicies++;
        }
        
        insurancePoolBalance += msg.value;
        policyCounter++;
        
        emit PolicyCreated(policyId, msg.sender, _flightNumber, _departureDate);
        emit PremiumPaid(policyId, msg.sender, msg.value);
        
        return policyId;
    }
    
    function getPolicyDetails(uint256 _policyId)
        external
        view
        policyExists(_policyId)
        returns (FlightPolicy memory)
    {
        return flightPolicies[_policyId];
    }

    function _createFlightKey(string memory _flightNumber, string memory _departureDate)
        internal
        pure
        returns (string memory)
    {
        return string(abi.encodePacked(_flightNumber, "_", _departureDate));
    }

    function recordFlightDelay(
        string memory _flightNumber,
        string memory _departureDate,
        uint256 _delayMinutes
    ) external onlyOwner {
        require(bytes(_flightNumber).length > 0, "Flight number cannot be empty");
        require(bytes(_departureDate).length > 0, "Departure date cannot be empty");
        
        string memory flightKey = _createFlightKey(_flightNumber, _departureDate);
        flightDelayMinutes[flightKey] = _delayMinutes;
        emit DelayRecorded(_flightNumber, _departureDate, _delayMinutes);
    }

    function isFlightDelayed(string memory _flightNumber, string memory _departureDate)
        external
        view
        returns (bool)
    {
        require(bytes(_flightNumber).length > 0, "Flight number cannot be empty");
        require(bytes(_departureDate).length > 0, "Departure date cannot be empty");
        
        string memory flightKey = _createFlightKey(_flightNumber, _departureDate);
        uint256 delayMinutes = flightDelayMinutes[flightKey];
        uint256 delayHours = delayMinutes / 60;
        return delayHours >= delayThresholdHours;
    }

    function getFlightDelay(string memory _flightNumber, string memory _departureDate)
        external
        view
        returns (uint256 delayMinutes, uint256 delayHours)
    {
        require(bytes(_flightNumber).length > 0, "Flight number cannot be empty");
        require(bytes(_departureDate).length > 0, "Departure date cannot be empty");
        
        string memory flightKey = _createFlightKey(_flightNumber, _departureDate);
        delayMinutes = flightDelayMinutes[flightKey];
        delayHours = delayMinutes / 60;
    }

    function claimCompensation(uint256 _policyId)
        external
        policyExists(_policyId)
        policyActive(_policyId)
        returns (bool)
    {
        FlightPolicy storage policy = flightPolicies[_policyId];
        
        require(msg.sender == policy.policyholder, "Only policyholder can claim");
        require(!policy.hasClaimedCompensation, "Compensation already claimed for this policy");

        string memory flightKey = _createFlightKey(policy.flightNumber, policy.departureDate);
        uint256 delayMinutes = flightDelayMinutes[flightKey];
        uint256 delayHours = delayMinutes / 60;
        
        require(delayHours >= delayThresholdHours, "Flight delay does not meet threshold");
        require(insurancePoolBalance >= compensationAmount, "Insurance pool does not have sufficient funds");
        
        policy.hasClaimedCompensation = true;
        policy.isActive = false;
        
        insurancePoolBalance -= compensationAmount;
        customers[msg.sender].totalClaimed += compensationAmount;
        
        (bool success, ) = payable(policy.policyholder).call{value: compensationAmount}("");
        require(success, "Compensation transfer failed");
        
        emit CompensationClaimed(_policyId, msg.sender, compensationAmount, "Flight delay compensation");
        
        return true;
    }
    
    function setDelayThreshold(uint256 _hours) external onlyOwner {
        delayThresholdHours = _hours;
    }
    
    function setCompensationAmount(uint256 _amount) external onlyOwner {
        compensationAmount = _amount;
    }
    
    function getContractSettings()
        external
        view
        returns (uint256 threshold, uint256 compensation, uint256 poolBalance)
    {
        return (delayThresholdHours, compensationAmount, insurancePoolBalance);
    }
    
    function getCustomerInfo(address _customer)
        external
        view
        returns (Customer memory)
    {
        return customers[_customer];
    }
    
    function withdrawFunds(uint256 _amount) external onlyOwner {
        require(_amount <= insurancePoolBalance, "Insufficient pool balance");
        insurancePoolBalance -= _amount;
        (bool success, ) = payable(owner).call{value: _amount}("");
        require(success, "Withdrawal failed");
    }
    
    function getTotalPolicies() external view returns (uint256) {
        return policyCounter;
    }
    
    function deactivatePolicy(uint256 _policyId)
        external
        onlyOwner
        policyExists(_policyId)
    {
        flightPolicies[_policyId].isActive = false;
    }
}
