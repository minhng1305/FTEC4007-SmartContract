// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract WeatherCropInsurance {
    
    address public owner;
    uint256 public insurancePoolBalance;
    uint256 public rainfallThreshold = 5;
    uint256 public consecutiveDaysThreshold = 3;
    uint256 public compensationPerClaim = 5 ether;
    
    struct WeatherData {
        string date;
        uint256 rainfallMM;
        uint256 timestamp;
    }
    
    struct CropPolicy {
        address farmer;
        string cropType;
        string startDate;
        string endDate;
        bool isActive;
        bool hasClaimedCompensation;
        uint256 premiumPaid;
        uint256 consecutiveDryDaysCounter;
    }
    
    struct Farmer {
        address farmAddress;
        string location;
        uint256 totalPolicies;
        uint256 totalClaimed;
        bool exists;
    }
    
    mapping(uint256 => CropPolicy) public cropPolicies;
    mapping(address => Farmer) public farmers;
    mapping(string => WeatherData) public weatherHistory;
    string[] public recordedDates;
    
    uint256 public policyCounter = 0;
    
    event PolicyCreated(uint256 indexed policyId, address indexed farmer, string cropType, string startDate, string endDate);
    event PremiumPaid(uint256 indexed policyId, address indexed farmer, uint256 amount);
    event WeatherDataRecorded(string indexed date, uint256 rainfallMM, uint256 timestamp);
    event CompensationClaimed(uint256 indexed policyId, address indexed farmer, uint256 compensationAmount, uint256 consecutiveDryDays);
    event PoolFunded(address indexed funder, uint256 amount);
    event PolicyDeactivated(uint256 indexed policyId, address indexed farmer);
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this function");
        _;
    }
    
    modifier policyExists(uint256 _policyId) {
        require(_policyId < policyCounter, "Policy does not exist");
        _;
    }
    
    modifier policyActive(uint256 _policyId) {
        require(cropPolicies[_policyId].isActive, "Policy is not active");
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
    
    function createCropPolicy(
        string memory _cropType,
        string memory _location,
        string memory _startDate,
        string memory _endDate
    ) external payable returns (uint256) {
        require(msg.value == 1 ether, "Premium must be exactly 1 ether");
        require(bytes(_cropType).length > 0, "Crop type cannot be empty");
        require(bytes(_startDate).length > 0, "Start date cannot be empty");
        require(bytes(_endDate).length > 0, "End date cannot be empty");
        require(compareStrings(_startDate, _endDate) <= 1, "Start date must be before or equal to end date");
        
        uint256 policyId = policyCounter;
        
        cropPolicies[policyId] = CropPolicy(
            msg.sender,
            _cropType,
            _startDate,
            _endDate,
            true,
            false,
            msg.value,
            0
        );
        
        if (!farmers[msg.sender].exists) {
            farmers[msg.sender] = Farmer(msg.sender, _location, 1, 0, true);
        } else {
            farmers[msg.sender].totalPolicies++;
        }
        
        insurancePoolBalance += msg.value;
        policyCounter++;
        
        emit PolicyCreated(policyId, msg.sender, _cropType, _startDate, _endDate);
        emit PremiumPaid(policyId, msg.sender, msg.value);
        
        return policyId;
    }
    
    function getPolicyDetails(uint256 _policyId)
        external
        view
        policyExists(_policyId)
        returns (CropPolicy memory)
    {
        return cropPolicies[_policyId];
    }
    
    function recordWeatherData(string memory _date, uint256 _rainfallMM) external onlyOwner {
        require(bytes(_date).length > 0, "Date cannot be empty");
        
        if (bytes(weatherHistory[_date].date).length == 0) {
            recordedDates.push(_date);
        }
        
        weatherHistory[_date] = WeatherData(_date, _rainfallMM, block.timestamp);
        emit WeatherDataRecorded(_date, _rainfallMM, block.timestamp);
    }
    
    function getAllWeatherData() external view returns (WeatherData[] memory) {
        WeatherData[] memory allData = new WeatherData[](recordedDates.length);
        for (uint256 i = 0; i < recordedDates.length; i++) {
            allData[i] = weatherHistory[recordedDates[i]];
        }
        return allData;
    }
    
    function getWeatherData(string memory _date)
        external
        view
        returns (WeatherData memory)
    {
        return weatherHistory[_date];
    }
    
    function compareStrings(string memory a, string memory b) 
        internal 
        pure 
        returns (uint256)
    {
        bytes memory aBytes = bytes(a);
        bytes memory bBytes = bytes(b);
        
        for (uint256 i = 0; i < aBytes.length && i < bBytes.length; i++) {
            if (aBytes[i] < bBytes[i]) {
                return 0;
            } else if (aBytes[i] > bBytes[i]) {
                return 2;
            }
        }
        
        if (aBytes.length < bBytes.length) {
            return 0;
        } else if (aBytes.length > bBytes.length) {
            return 2;
        } else {
            return 1;
        }
    }
    
    function isDateInPolicyPeriod(uint256 _policyId, string memory _date) 
        internal 
        view 
        policyExists(_policyId)
        returns (bool)
    {
        CropPolicy memory policy = cropPolicies[_policyId];
        
        uint256 cmpStart = compareStrings(_date, policy.startDate);
        bool isAfterOrEqualStart = (cmpStart == 1 || cmpStart == 2);
        
        uint256 cmpEnd = compareStrings(_date, policy.endDate);
        bool isBeforeOrEqualEnd = (cmpEnd == 0 || cmpEnd == 1);
        
        return (isAfterOrEqualStart && isBeforeOrEqualEnd);
    }
    
    function updateDryDaysCounter(uint256 _policyId)
        external
        policyExists(_policyId)
        policyActive(_policyId)
    {
        CropPolicy storage policy = cropPolicies[_policyId];
        require(recordedDates.length > 0, "No weather data recorded yet");
        
        uint256 consecutiveDays = 0;
        uint256 maxConsecutiveDays = 0;
        
        for (uint256 i = 0; i < recordedDates.length; i++) {
            string memory date = recordedDates[i];
            
            if (isDateInPolicyPeriod(_policyId, date)) {
                uint256 rainfall = weatherHistory[date].rainfallMM;
                
                if (rainfall < rainfallThreshold) {
                    consecutiveDays++;
                    if (consecutiveDays > maxConsecutiveDays) {
                        maxConsecutiveDays = consecutiveDays;
                    }
                } else {
                    consecutiveDays = 0;
                }
            }
        }
        
        policy.consecutiveDryDaysCounter = maxConsecutiveDays;
    }
    
    function getConsecutiveDryDays(uint256 _policyId)
        external
        view
        policyExists(_policyId)
        returns (uint256)
    {
        return cropPolicies[_policyId].consecutiveDryDaysCounter;
    }
    
    function isDroughtConditionMet(uint256 _policyId)
        external
        view
        policyExists(_policyId)
        returns (bool)
    {
        CropPolicy memory policy = cropPolicies[_policyId];
        return policy.consecutiveDryDaysCounter >= consecutiveDaysThreshold;
    }
    
    function claimDroughtCompensation(uint256 _policyId)
        external
        policyExists(_policyId)
        policyActive(_policyId)
        returns (bool)
    {
        CropPolicy storage policy = cropPolicies[_policyId];
        
        require(msg.sender == policy.farmer, "Only farmer can claim");
        require(!policy.hasClaimedCompensation, "Compensation already claimed for this policy");
        require(policy.consecutiveDryDaysCounter >= consecutiveDaysThreshold, "Consecutive dry days threshold not met");
        require(insurancePoolBalance >= compensationPerClaim, "Insurance pool does not have sufficient funds");
        
        policy.hasClaimedCompensation = true;
        policy.isActive = false;
        
        insurancePoolBalance -= compensationPerClaim;
        farmers[msg.sender].totalClaimed += compensationPerClaim;
        
        (bool success, ) = payable(policy.farmer).call{value: compensationPerClaim}("");
        require(success, "Compensation transfer failed");
        
        emit CompensationClaimed(_policyId, msg.sender, compensationPerClaim, policy.consecutiveDryDaysCounter);
        
        return true;
    }
    
    function setRainfallThreshold(uint256 _mm) external onlyOwner {
        rainfallThreshold = _mm;
    }
    
    function setConsecutiveDaysThreshold(uint256 _days) external onlyOwner {
        consecutiveDaysThreshold = _days;
    }
    
    function setCompensationAmount(uint256 _amount) external onlyOwner {
        compensationPerClaim = _amount;
    }
    
    function getContractSettings()
        external
        view
        returns (uint256 rainfallThresh, uint256 consecutiveDaysThresh, uint256 compensation, uint256 poolBalance)
    {
        return (rainfallThreshold, consecutiveDaysThreshold, compensationPerClaim, insurancePoolBalance);
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
        cropPolicies[_policyId].isActive = false;
        emit PolicyDeactivated(_policyId, cropPolicies[_policyId].farmer);
    }
}
