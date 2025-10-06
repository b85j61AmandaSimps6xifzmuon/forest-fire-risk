# ForestFireRiskFHE.sol

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract ForestFireRiskFHE is SepoliaConfig {
    struct EncryptedData {
        uint256 id;
        euint32 encryptedTemperature;   // Encrypted temperature
        euint32 encryptedHumidity;      // Encrypted humidity
        euint32 encryptedVegetation;    // Encrypted vegetation index
        euint32 encryptedHistoricalFires; // Encrypted past fire incidents
        uint256 timestamp;
    }
    
    struct DecryptedData {
        string temperature;
        string humidity;
        string vegetation;
        string historicalFires;
        bool isRevealed;
    }

    uint256 public dataCount;
    mapping(uint256 => EncryptedData) public encryptedDataset;
    mapping(uint256 => DecryptedData) public decryptedDataset;
    
    mapping(string => euint32) private encryptedRiskCategoryCount;
    string[] private riskCategories;
    
    mapping(uint256 => uint256) private requestToDataId;
    
    event DataSubmitted(uint256 indexed id, uint256 timestamp);
    event DecryptionRequested(uint256 indexed id);
    event DataDecrypted(uint256 indexed id);
    
    modifier onlyDataProvider(uint256 dataId) {
        _; // Placeholder for access control
    }
    
    /// @notice Submit encrypted environmental data
    function submitEncryptedData(
        euint32 encryptedTemperature,
        euint32 encryptedHumidity,
        euint32 encryptedVegetation,
        euint32 encryptedHistoricalFires
    ) public {
        dataCount += 1;
        uint256 newId = dataCount;
        
        encryptedDataset[newId] = EncryptedData({
            id: newId,
            encryptedTemperature: encryptedTemperature,
            encryptedHumidity: encryptedHumidity,
            encryptedVegetation: encryptedVegetation,
            encryptedHistoricalFires: encryptedHistoricalFires,
            timestamp: block.timestamp
        });
        
        decryptedDataset[newId] = DecryptedData({
            temperature: "",
            humidity: "",
            vegetation: "",
            historicalFires: "",
            isRevealed: false
        });
        
        emit DataSubmitted(newId, block.timestamp);
    }
    
    /// @notice Request decryption of a dataset
    function requestDataDecryption(uint256 dataId) public onlyDataProvider(dataId) {
        EncryptedData storage data = encryptedDataset[dataId];
        require(!decryptedDataset[dataId].isRevealed, "Already decrypted");
        
        bytes32 ;
        ciphertexts[0] = FHE.toBytes32(data.encryptedTemperature);
        ciphertexts[1] = FHE.toBytes32(data.encryptedHumidity);
        ciphertexts[2] = FHE.toBytes32(data.encryptedVegetation);
        ciphertexts[3] = FHE.toBytes32(data.encryptedHistoricalFires);
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptData.selector);
        requestToDataId[reqId] = dataId;
        
        emit DecryptionRequested(dataId);
    }
    
    /// @notice Callback for decrypted dataset
    function decryptData(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 dataId = requestToDataId[requestId];
        require(dataId != 0, "Invalid request");
        
        EncryptedData storage eData = encryptedDataset[dataId];
        DecryptedData storage dData = decryptedDataset[dataId];
        require(!dData.isRevealed, "Already decrypted");
        
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        string[] memory results = abi.decode(cleartexts, (string[]));
        
        dData.temperature = results[0];
        dData.humidity = results[1];
        dData.vegetation = results[2];
        dData.historicalFires = results[3];
        dData.isRevealed = true;
        
        string memory riskCategory = computeRiskCategory(dData);
        
        if (FHE.isInitialized(encryptedRiskCategoryCount[riskCategory]) == false) {
            encryptedRiskCategoryCount[riskCategory] = FHE.asEuint32(0);
            riskCategories.push(riskCategory);
        }
        encryptedRiskCategoryCount[riskCategory] = FHE.add(
            encryptedRiskCategoryCount[riskCategory],
            FHE.asEuint32(1)
        );
        
        emit DataDecrypted(dataId);
    }
    
    /// @notice Compute risk category (placeholder)
    function computeRiskCategory(DecryptedData memory dData) private pure returns (string memory) {
        return "High"; // Simplified; actual model runs off-chain
    }
    
    /// @notice Get decrypted dataset
    function getDecryptedData(uint256 dataId) public view returns (
        string memory temperature,
        string memory humidity,
        string memory vegetation,
        string memory historicalFires,
        bool isRevealed
    ) {
        DecryptedData storage r = decryptedDataset[dataId];
        return (
            r.temperature,
            r.humidity,
            r.vegetation,
            r.historicalFires,
            r.isRevealed
        );
    }
    
    /// @notice Get encrypted risk category count
    function getEncryptedRiskCategoryCount(string memory category) public view returns (euint32) {
        return encryptedRiskCategoryCount[category];
    }
    
    /// @notice Request risk category count decryption
    function requestRiskCategoryDecryption(string memory category) public {
        euint32 count = encryptedRiskCategoryCount[category];
        require(FHE.isInitialized(count), "Category not found");
        
        bytes32 ;
        ciphertexts[0] = FHE.toBytes32(count);
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptRiskCategory.selector);
        requestToDataId[reqId] = bytes32ToUint(keccak256(abi.encodePacked(category)));
    }
    
    /// @notice Callback for decrypted risk category
    function decryptRiskCategory(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 categoryHash = requestToDataId[requestId];
        string memory category = getCategoryFromHash(categoryHash);
        
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        uint32 count = abi.decode(cleartexts, (uint32));
        // Handle decrypted count
    }
    
    // Helper functions
    function bytes32ToUint(bytes32 b) private pure returns (uint256) {
        return uint256(b);
    }
    
    function getCategoryFromHash(uint256 hash) private view returns (string memory) {
        for (uint i = 0; i < riskCategories.length; i++) {
            if (bytes32ToUint(keccak256(abi.encodePacked(riskCategories[i]))) == hash) {
                return riskCategories[i];
            }
        }
        revert("Category not found");
    }
}
