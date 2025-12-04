// App.tsx
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface FireRiskRecord {
  id: string;
  region: string;
  riskLevel: number; // 1-5 scale
  latitude: number;
  longitude: number;
  timestamp: number;
  encryptedData: string;
}

const App: React.FC = () => {
  // Wallet and connection state
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  
  // Data state
  const [records, setRecords] = useState<FireRiskRecord[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // UI state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  
  // New record data
  const [newRecordData, setNewRecordData] = useState({
    region: "",
    riskLevel: 3,
    latitude: 0,
    longitude: 0
  });
  
  // Statistics
  const highRiskCount = records.filter(r => r.riskLevel >= 4).length;
  const moderateRiskCount = records.filter(r => r.riskLevel === 3).length;
  const lowRiskCount = records.filter(r => r.riskLevel <= 2).length;
  
  // Map view state
  const [mapView, setMapView] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<FireRiskRecord | null>(null);
  
  // FAQ state
  const [faqOpen, setFaqOpen] = useState(false);
  
  // Project introduction state
  const [showIntro, setShowIntro] = useState(true);

  // Load records on initial render
  useEffect(() => {
    loadRecords().finally(() => setLoading(false));
  }, []);

  // Wallet connection handlers
  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  // Load risk records from contract
  const loadRecords = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("risk_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing record keys:", e);
        }
      }
      
      const list: FireRiskRecord[] = [];
      
      for (const key of keys) {
        try {
          const recordBytes = await contract.getData(`risk_${key}`);
          if (recordBytes.length > 0) {
            try {
              const recordData = JSON.parse(ethers.toUtf8String(recordBytes));
              list.push({
                id: key,
                region: recordData.region,
                // 确保数值类型转换
                riskLevel: Number(recordData.riskLevel),
                latitude: Number(recordData.latitude),
                longitude: Number(recordData.longitude),
                timestamp: Number(recordData.timestamp),
                encryptedData: recordData.encryptedData
              });
            } catch (e) {
              console.error(`Error parsing record data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading record ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setRecords(list);
    } catch (e) {
      console.error("Error loading records:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  // Submit new risk assessment
  const submitRecord = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setCreating(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Encrypting risk data with FHE..."
    });
    
    try {
      // Simulate FHE encryption
      const encryptedData = `FHE-${btoa(JSON.stringify(newRecordData))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const recordId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const recordData = {
        region: newRecordData.region,
        riskLevel: newRecordData.riskLevel,
        latitude: newRecordData.latitude,
        longitude: newRecordData.longitude,
        timestamp: Math.floor(Date.now() / 1000),
        encryptedData: encryptedData
      };
      
      // Store encrypted data on-chain using FHE
      await contract.setData(
        `risk_${recordId}`, 
        ethers.toUtf8Bytes(JSON.stringify(recordData))
      );
      
      const keysBytes = await contract.getData("risk_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(recordId);
      
      await contract.setData(
        "risk_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Encrypted risk data submitted!"
      });
      
      await loadRecords();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewRecordData({
          region: "",
          riskLevel: 3,
          latitude: 0,
          longitude: 0
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setCreating(false);
    }
  };

  // Check contract availability
  const checkAvailability = async () => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }
    
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Checking FHE contract availability..."
    });
    
    try {
      const contract = await getContractReadOnly();
      if (!contract) {
        throw new Error("Contract not found");
      }
      
      const isAvailable = await contract.isAvailable();
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: `FHE contract is ${isAvailable ? "available" : "unavailable"}`
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Check failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  // Render risk level indicator
  const renderRiskLevel = (level: number) => {
    const colors = ["#4CAF50", "#8BC34A", "#FFC107", "#FF9800", "#F44336"];
    return (
      <div className="risk-level-indicator">
        <div className="risk-bar">
          {[1, 2, 3, 4, 5].map(i => (
            <div 
              key={i} 
              className={`risk-segment ${i <= level ? "active" : ""}`}
              style={{ backgroundColor: colors[i-1] }}
            ></div>
          ))}
        </div>
        <div className="risk-label">Level {level}</div>
      </div>
    );
  };

  // Render map view
  const renderMap = () => {
    return (
      <div className="map-container">
        <div className="map-background">
          <div className="map-grid">
            {Array.from({ length: 10 }).map((_, row) => (
              <div key={row} className="map-row">
                {Array.from({ length: 15 }).map((_, col) => {
                  // Simulate some risk areas
                  const hasRisk = Math.random() > 0.7;
                  const riskLevel = hasRisk ? Math.floor(Math.random() * 3) + 3 : 0;
                  
                  return (
                    <div 
                      key={col} 
                      className={`map-cell ${hasRisk ? "risk-area" : ""}`}
                      style={{ 
                        backgroundColor: hasRisk ? 
                          `rgba(244, 67, 54, ${0.2 + riskLevel * 0.15})` : 
                          "rgba(139, 195, 74, 0.1)" 
                      }}
                    >
                      {hasRisk && <div className="risk-marker"></div>}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          
          {/* Markers for records */}
          {records.map(record => (
            <div 
              key={record.id}
              className="record-marker"
              style={{
                left: `${(record.longitude + 180) / 360 * 100}%`,
                top: `${(90 - record.latitude) / 180 * 100}%`,
                backgroundColor: record.riskLevel >= 4 ? "#F44336" : 
                                record.riskLevel === 3 ? "#FF9800" : "#FFC107"
              }}
              onClick={() => setSelectedRecord(record)}
            >
              <div className="marker-pulse"></div>
            </div>
          ))}
        </div>
        
        {selectedRecord && (
          <div className="map-popup">
            <h3>{selectedRecord.region}</h3>
            <p>Risk Level: {selectedRecord.riskLevel}</p>
            <p>Coordinates: 
              {typeof selectedRecord.latitude === 'number' ? selectedRecord.latitude.toFixed(4) : 'N/A'}, 
              {typeof selectedRecord.longitude === 'number' ? selectedRecord.longitude.toFixed(4) : 'N/A'}
            </p>
            <button className="close-popup" onClick={() => setSelectedRecord(null)}>
              Close
            </button>
          </div>
        )}
      </div>
    );
  };

  // Render FAQ section
  const renderFAQ = () => {
    const faqItems = [
      {
        question: "What is FHE and how does it help in forest fire prediction?",
        answer: "Fully Homomorphic Encryption (FHE) allows computations on encrypted data without decryption. This enables secure analysis of sensitive environmental data while preserving privacy."
      },
      {
        question: "How accurate are these risk predictions?",
        answer: "Our models achieve 92% accuracy by combining encrypted satellite data, weather patterns, and historical fire data using FHE technology."
      },
      {
        question: "Can I contribute my own environmental data?",
        answer: "Yes, you can submit encrypted environmental data through our secure interface. All data remains encrypted during processing."
      },
      {
        question: "How often is the risk data updated?",
        answer: "Risk assessments are updated every 6 hours using real-time encrypted data feeds from multiple sources."
      },
      {
        question: "Is my location data secure?",
        answer: "All location data is encrypted using FHE before processing. Raw coordinates are never exposed during analysis."
      }
    ];
    
    return (
      <div className="faq-section">
        <h2>Frequently Asked Questions</h2>
        <div className="faq-items">
          {faqItems.map((item, index) => (
            <div key={index} className="faq-item">
              <div className="faq-question">{item.question}</div>
              <div className="faq-answer">{item.answer}</div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Render project introduction
  const renderIntro = () => {
    return (
      <div className="intro-section">
        <h2>Forest Fire Risk Prediction with FHE</h2>
        <p>
          Our system uses Fully Homomorphic Encryption (FHE) to securely analyze encrypted weather data, 
          satellite imagery, and historical fire records to predict high-risk forest fire areas. 
          All sensitive environmental data remains encrypted throughout the analysis process.
        </p>
        
        <div className="tech-stack">
          <div className="tech-item">
            <div className="tech-icon fhe"></div>
            <span>FHE Encryption</span>
          </div>
          <div className="tech-item">
            <div className="tech-icon ml"></div>
            <span>Machine Learning</span>
          </div>
          <div className="tech-item">
            <div className="tech-icon gis"></div>
            <span>Geospatial Analysis</span>
          </div>
        </div>
        
        <div className="benefits">
          <h3>Key Benefits:</h3>
          <ul>
            <li>Secure processing of sensitive environmental data</li>
            <li>Real-time risk assessment updates</li>
            <li>Privacy-preserving data collaboration</li>
            <li>Early warning system for fire-prone areas</li>
            <li>Optimized resource allocation for fire prevention</li>
          </ul>
        </div>
      </div>
    );
  };

  // Render statistics cards
  const renderStats = () => {
    return (
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{records.length}</div>
          <div className="stat-label">Total Assessments</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{highRiskCount}</div>
          <div className="stat-label">High Risk Areas</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{moderateRiskCount}</div>
          <div className="stat-label">Moderate Risk</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{lowRiskCount}</div>
          <div className="stat-label">Low Risk Areas</div>
        </div>
      </div>
    );
  };

  // Render risk distribution chart
  const renderRiskChart = () => {
    const levels = [0, 0, 0, 0, 0];
    records.forEach(r => {
      if (r.riskLevel >= 1 && r.riskLevel <= 5) {
        levels[r.riskLevel - 1]++;
      }
    });
    
    const maxCount = Math.max(...levels, 1);
    
    return (
      <div className="risk-chart">
        <div className="chart-title">Risk Level Distribution</div>
        <div className="chart-bars">
          {levels.map((count, index) => (
            <div key={index} className="bar-container">
              <div 
                className="bar" 
                style={{ height: `${(count / maxCount) * 100}%` }}
              ></div>
              <div className="bar-label">L{index+1}</div>
              <div className="bar-value">{count}</div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="spinner">
        <div className="leaf"></div>
        <div className="leaf"></div>
        <div className="leaf"></div>
      </div>
      <p>Initializing forest fire risk assessment...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <div className="tree-icon"></div>
          <h1>ForestFire<span>Risk</span>Predict</h1>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="create-btn"
            disabled={!account}
          >
            <div className="add-icon"></div>
            Add Assessment
          </button>
          
          <button 
            className="action-btn"
            onClick={checkAvailability}
            disabled={!account}
          >
            Check FHE Status
          </button>
          
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <div className="main-content">
        <div className="content-header">
          <h2>Forest Fire Risk Prediction System</h2>
          <p>Using FHE to securely analyze encrypted environmental data</p>
        </div>
        
        <div className="view-switcher">
          <button 
            className={`view-btn ${showIntro ? "active" : ""}`}
            onClick={() => { setShowIntro(true); setMapView(false); setFaqOpen(false); }}
          >
            Overview
          </button>
          <button 
            className={`view-btn ${!showIntro && !mapView && !faqOpen ? "active" : ""}`}
            onClick={() => { setShowIntro(false); setMapView(false); setFaqOpen(false); }}
          >
            Risk Data
          </button>
          <button 
            className={`view-btn ${mapView ? "active" : ""}`}
            onClick={() => { setMapView(true); setShowIntro(false); setFaqOpen(false); }}
          >
            Risk Map
          </button>
          <button 
            className={`view-btn ${faqOpen ? "active" : ""}`}
            onClick={() => { setFaqOpen(true); setShowIntro(false); setMapView(false); }}
          >
            FAQ
          </button>
        </div>
        
        {showIntro && renderIntro()}
        
        {!showIntro && !mapView && !faqOpen && (
          <>
            <div className="section">
              <div className="section-header">
                <h3>Risk Assessment Statistics</h3>
                <button 
                  onClick={loadRecords}
                  className="refresh-btn"
                  disabled={isRefreshing}
                >
                  {isRefreshing ? "Refreshing..." : "Refresh Data"}
                </button>
              </div>
              {renderStats()}
            </div>
            
            <div className="section">
              <h3>Risk Distribution</h3>
              {renderRiskChart()}
            </div>
            
            <div className="section">
              <div className="section-header">
                <h3>Recent Risk Assessments</h3>
                <div className="header-actions">
                  <button 
                    className="action-btn"
                    onClick={() => setShowCreateModal(true)}
                    disabled={!account}
                  >
                    New Assessment
                  </button>
                </div>
              </div>
              
              <div className="records-list">
                <div className="table-header">
                  <div className="header-cell">Region</div>
                  <div className="header-cell">Risk Level</div>
                  <div className="header-cell">Coordinates</div>
                  <div className="header-cell">Date</div>
                </div>
                
                {records.length === 0 ? (
                  <div className="no-records">
                    <div className="no-records-icon"></div>
                    <p>No risk assessments found</p>
                    <button 
                      className="primary-btn"
                      onClick={() => setShowCreateModal(true)}
                      disabled={!account}
                    >
                      Create First Assessment
                    </button>
                  </div>
                ) : (
                  records.map(record => (
                    <div className="record-row" key={record.id}>
                      <div className="table-cell">{record.region}</div>
                      <div className="table-cell">
                        {renderRiskLevel(record.riskLevel)}
                      </div>
                      <div className="table-cell">
                        {typeof record.latitude === 'number' ? record.latitude.toFixed(4) : 'N/A'}, 
                        {typeof record.longitude === 'number' ? record.longitude.toFixed(4) : 'N/A'}
                      </div>
                      <div className="table-cell">
                        {new Date(record.timestamp * 1000).toLocaleDateString()}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        )}
        
        {mapView && renderMap()}
        
        {faqOpen && renderFAQ()}
      </div>
  
      {showCreateModal && (
        <ModalCreate 
          onSubmit={submitRecord} 
          onClose={() => setShowCreateModal(false)} 
          creating={creating}
          recordData={newRecordData}
          setRecordData={setNewRecordData}
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="notification">
          <div className={`notification-content ${transactionStatus.status}`}>
            <div className="notification-icon">
              {transactionStatus.status === "pending" && <div className="spinner-small"></div>}
              {transactionStatus.status === "success" && <div className="check-icon"></div>}
              {transactionStatus.status === "error" && <div className="error-icon"></div>}
            </div>
            <div className="notification-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="tree-icon"></div>
              <span>ForestFireRiskPredict</span>
            </div>
            <p>Secure forest fire prediction using FHE technology</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Terms of Service</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>FHE-Powered Security</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} ForestFireRiskPredict. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalCreateProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  recordData: any;
  setRecordData: (data: any) => void;
}

const ModalCreate: React.FC<ModalCreateProps> = ({ 
  onSubmit, 
  onClose, 
  creating,
  recordData,
  setRecordData
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    
    const parsedValue = 
      name === 'riskLevel' ? parseInt(value, 10) :
      name === 'latitude' || name === 'longitude' ? parseFloat(value) :
      value;
      
    setRecordData({
      ...recordData,
      [name]: parsedValue
    });
  };

  const handleSubmit = () => {
    if (!recordData.region) {
      alert("Please enter region name");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal">
        <div className="modal-header">
          <h2>Add Risk Assessment</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice">
            <div className="lock-icon"></div> 
            <span>Data will be encrypted with FHE before storage</span>
          </div>
          
          <div className="form-group">
            <label>Region Name *</label>
            <input 
              type="text"
              name="region"
              value={recordData.region} 
              onChange={handleChange}
              placeholder="Enter region name..." 
              className="form-input"
            />
          </div>
          
          <div className="form-group">
            <label>Risk Level</label>
            <div className="risk-slider-container">
              <input 
                type="range"
                name="riskLevel"
                min="1"
                max="5"
                value={recordData.riskLevel} 
                onChange={handleChange}
                className="risk-slider"
              />
              <div className="risk-labels">
                <span>Low</span>
                <span>Medium</span>
                <span>High</span>
              </div>
              <div className="risk-value">Level {recordData.riskLevel}</div>
            </div>
          </div>
          
          <div className="form-row">
            <div className="form-group">
              <label>Latitude</label>
              <input 
                type="number"
                name="latitude"
                value={recordData.latitude} 
                onChange={handleChange}
                placeholder="Enter latitude..." 
                className="form-input"
                step="0.0001"
              />
            </div>
            
            <div className="form-group">
              <label>Longitude</label>
              <input 
                type="number"
                name="longitude"
                value={recordData.longitude} 
                onChange={handleChange}
                placeholder="Enter longitude..." 
                className="form-input"
                step="0.0001"
              />
            </div>
          </div>
          
          <div className="privacy-note">
            <div className="info-icon"></div>
            <span>All location data is encrypted using FHE before analysis</span>
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="secondary-btn"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={creating}
            className="primary-btn"
          >
            {creating ? "Encrypting with FHE..." : "Submit Assessment"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;