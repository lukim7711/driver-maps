import { useState, useEffect } from 'react';
import { 
  Upload, 
  Navigation, 
  CheckCircle2, 
  FileImage, 
  Trash2, 
  TrendingUp, 
  AlertCircle, 
  HelpCircle,
  Zap
} from 'lucide-react';
import MapComponent from './components/MapComponent';
import { compressImages } from './utils/imageCompress';
import './App.css';

export default function App() {
  const [files, setFiles] = useState([]);
  const [driverLat, setDriverLat] = useState('-6.160000');
  const [driverLng, setDriverLng] = useState('106.750000');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Response data states
  const [waypoints, setWaypoints] = useState([]);
  const [routeDetails, setRouteDetails] = useState(null);
  const [navigationLink, setNavigationLink] = useState(null);
  const [completedSteps, setCompletedSteps] = useState({});

  // Route comparison states
  const [routesData, setRoutesData] = useState(null);
  const [selectedRouteAPI, setSelectedRouteAPI] = useState('places');
  const [visibilityFlags, setVisibilityFlags] = useState({
    geocoding: true,
    places: true
  });

  const [compressionStatus, setCompressionStatus] = useState({
    isCompressing: false,
    originalSize: 0,
    compressedSize: 0,
    completed: 0,
    total: 0
  });

  const handleCompress = async (incomingFiles) => {
    const originalTotal = files.reduce((s, f) => s + f.size, 0) + incomingFiles.reduce((s, f) => s + f.size, 0);
    setCompressionStatus({
      isCompressing: true,
      originalSize: originalTotal,
      compressedSize: 0,
      completed: 0,
      total: incomingFiles.length
    });

    try {
      const results = await compressImages(incomingFiles, (completed, total) => {
        setCompressionStatus(prev => ({ ...prev, completed, total }));
      });

      const compressedTotal = [...files, ...results.map(r => r.file)].reduce((s, f) => s + f.size, 0);
      return { results, compressedTotal, originalTotal };
    } catch (err) {
      console.error('Compression batch error:', err);
      const results = incomingFiles.map(f => ({ file: f, originalSize: f.size, compressedSize: f.size, skipped: true }));
      const compressedTotal = [...files, ...incomingFiles].reduce((s, f) => s + f.size, 0);
      return { results, compressedTotal, originalTotal };
    }
  };

  const handleFileChange = async (e) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      const totalAllowed = 5 - files.length;
      if (totalAllowed <= 0) {
        setError('Maksimal 5 gambar. Hapus file yang ada untuk menambah baru.');
        return;
      }
      const incomingFiles = selectedFiles.slice(0, totalAllowed);

      const { results, compressedTotal, originalTotal } = await handleCompress(incomingFiles);
      const compressedFiles = results.map(r => r.file);
      const allFiles = [...files, ...compressedFiles];

      setFiles(allFiles);
      setCompressionStatus({
        isCompressing: false,
        originalSize: originalTotal,
        compressedSize: compressedTotal,
        completed: results.length,
        total: incomingFiles.length
      });
      setError(null);
    }
  };

  const handleRemoveFile = (indexToRemove) => {
    setFiles(files.filter((_, idx) => idx !== indexToRemove));
  };

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setDriverLat(position.coords.latitude.toFixed(6));
          setDriverLng(position.coords.longitude.toFixed(6));
        },
        () => {
          console.warn('Geolocation access denied/failed, using default coordinates (Jakarta Barat).');
        }
      );
    }
  }, []);

  const toggleStepCompleted = (index) => {
    setCompletedSteps(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (files.length === 0) {
      setError('Silakan pilih minimal 1 file gambar screenshot terlebih dahulu!');
      return;
    }

    setLoading(true);
    setError(null);
    setWaypoints([]);
    setRouteDetails(null);
    setNavigationLink(null);
    setCompletedSteps({});

    const formData = new FormData();
    files.forEach((file) => {
      formData.append('screenshots', file);
    });
    formData.append('driver_lat', driverLat);
    formData.append('driver_lng', driverLng);

    try {
      const response = await fetch('/api/extract-address', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (response.ok && result.success) {
        setRoutesData(result.routes || null);
        setWaypoints([]);
        setRouteDetails(null);
        setNavigationLink(null);
        if (result.warning) {
          setError(result.warning);
        }
      } else {
        throw new Error(result.error || result.details || 'Terjadi kesalahan pada server.');
      }
    } catch (err) {
      console.error('Error processing route:', err);
      setError(`Gagal memproses rute: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Convert duration string "Xs" or number to descriptive format
  const formatDuration = (durationVal) => {
    if (!durationVal) return null;
    let seconds;
    if (typeof durationVal === 'string') {
      seconds = parseInt(durationVal.replace('s', ''), 10);
    } else {
      seconds = durationVal;
    }
    
    const totalMinutes = Math.round(seconds / 60);
    if (totalMinutes < 60) {
      return `${totalMinutes} menit`;
    }
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return `${hours} jam ${mins} menit`;
  };

  // Convert meters to km
  const formatDistance = (meters) => {
    if (!meters) return null;
    return `${(meters / 1000).toFixed(1)} km`;
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 KB';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const currentRouteAPI = selectedRouteAPI;
  const currentRoute = routesData ? routesData[currentRouteAPI] : null;
  const currentWaypoints = currentRoute ? currentRoute.optimized_waypoints : waypoints;
  const currentRouteDetails = currentRoute ? currentRoute.route_details : routeDetails;
  const currentNavigationLink = currentRoute ? currentRoute.navigation_link : navigationLink;

  return (
    <div className="app-container">
      {/* LEFT SIDEBAR: Controls & Rute List */}
      <div className="sidebar">
        
        {/* Header */}
        <div className="glass-panel" style={{ padding: '16px' }}>
          <h1 className="app-title">Ojol-Cuanbot Router</h1>
          <p className="app-subtitle">Kurir Multi-Drop Smart Route Optimizer (AI OCR)</p>
        </div>

        {/* Controls: Form Upload & Driver Simulator */}
        <div className="glass-panel">
              <h2 className="section-title"><Upload size={18} /> Unggah Screenshot Struk</h2>
              
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <label className="upload-zone">
                  <input 
                    type="file" 
                    multiple 
                    accept="image/*" 
                    onChange={handleFileChange} 
                    className="checkbox-input"
                  />
                  <div className="upload-icon-wrapper">
                    <Upload size={22} />
                  </div>
                  <span className="upload-text">Pilih atau Drag File di Sini</span>
                  <span className="upload-subtext">Maksimal 5 file screenshot detail pesanan</span>
                </label>

                {compressionStatus.isCompressing && (
                  <div style={{
                    padding: '10px 12px',
                    background: 'rgba(59, 130, 246, 0.1)',
                    border: '1px solid rgba(59, 130, 246, 0.2)',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    fontSize: '11px',
                    color: '#93c5fd'
                  }}>
                    <div className="loader-spinner" style={{ width: '16px', height: '16px', borderWidth: '3px', borderColor: 'rgba(59,130,246,0.2)', borderTopColor: '#3b82f6' }}></div>
                    <span>Mengompresi gambar... ({compressionStatus.completed}/{compressionStatus.total})</span>
                  </div>
                )}

                {!compressionStatus.isCompressing && compressionStatus.compressedSize > 0 && compressionStatus.originalSize > compressionStatus.compressedSize && (
                  <div style={{
                    padding: '10px 12px',
                    background: 'rgba(34, 197, 94, 0.08)',
                    border: '1px solid rgba(34, 197, 94, 0.15)',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <Zap size={14} color="#22c55e" />
                    <span style={{ fontSize: '11px', color: '#86efac', lineHeight: '1.4' }}>
                      <strong>Hemat kuota {Math.round((1 - compressionStatus.compressedSize / compressionStatus.originalSize) * 100)}%</strong><br/>
                      <span style={{ opacity: 0.7 }}>
                        {formatFileSize(compressionStatus.originalSize)} → {formatFileSize(compressionStatus.compressedSize)}
                      </span>
                    </span>
                  </div>
                )}

                {/* List of chosen files */}
                {files.length > 0 && (
                  <div className="file-previews">
                    {files.map((file, idx) => (
                      <div key={idx} className="preview-chip">
                        <FileImage size={12} />
                        <span className="file-chip-name" style={{ maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {file.name}
                        </span>
                        <span style={{ fontSize: '9px', color: '#64748b', marginLeft: 'auto', flexShrink: 0 }}>
                          {formatFileSize(file.size)}
                        </span>
                        <button type="button" onClick={() => handleRemoveFile(idx)} className="remove-file-btn">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <button 
                  type="submit" 
                  className="action-btn"
                  disabled={loading || files.length === 0}
                >
                  {loading ? (
                    <>
                      <div className="loader-spinner"></div>
                      <span>AI sedang memproses...</span>
                    </>
                  ) : (
                    <>
                      <TrendingUp size={16} />
                      <span>Optimalkan Rute Pintar</span>
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* Results: Optimized Waypoints Timeline */}
            <div className="glass-panel scroll-panel">
              <h2 className="section-title"><CheckCircle2 size={18} /> Rincian Urutan Kunjungan</h2>
              
              {error && (
                <div className="preview-chip" style={{ background: 'rgba(239, 68, 68, 0.08)', borderColor: 'rgba(239, 68, 68, 0.2)', color: '#f87171', padding: '8px 12px', borderRadius: '8px', marginBottom: '12px', display: 'flex', width: '100%' }}>
                  <AlertCircle size={16} style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: '11px', lineHeight: '1.4' }}>{error}</span>
                </div>
              )}

              {loading && (
                <div className="loading-container">
                  <div className="loader-spinner" style={{ width: '32px', height: '32px', borderWidth: '4px' }}></div>
                  <p>Membaca struk dengan AI Multimodal...</p>
                  <small style={{ color: '#64748b', fontSize: '11px' }}>Mengekstrak alamat, geocoding koordinat, dan menyusun rute satu arah terbaik.</small>
                </div>
              )}

              {/* RENDER THE COMPARATOR ACCURACY PANEL HERE IF ROUTES DATA IS AVAILABLE */}
              {!loading && routesData && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '10px', padding: '12px' }}>
                  <h3 className="section-title" style={{ fontSize: '13px', marginBottom: '8px', color: '#f1f5f9' }}><TrendingUp size={14} /> Komparasi Rute Visual</h3>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {/* Geocoding */}
                    <div 
                      onClick={() => setSelectedRouteAPI('geocoding')}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', padding: '8px 10px', borderRadius: '8px', background: selectedRouteAPI === 'geocoding' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.04)', border: selectedRouteAPI === 'geocoding' ? '2px solid rgba(239, 68, 68, 0.6)' : '1px solid rgba(239, 68, 68, 0.1)', cursor: 'pointer', transition: 'all 0.2s ease' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input 
                          type="checkbox" 
                          checked={visibilityFlags.geocoding}
                          onChange={(e) => setVisibilityFlags(prev => ({ ...prev, geocoding: e.target.checked }))}
                          onClick={(e) => e.stopPropagation()}
                          style={{ accentColor: '#ef4444', cursor: 'pointer' }}
                        />
                        <span style={{ color: '#ef4444', fontWeight: 700 }}>🔴 Geocoding</span>
                        {selectedRouteAPI === 'geocoding' && <span style={{ fontSize: '8px', background: 'rgba(239, 68, 68, 0.25)', color: '#ef4444', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>◀ AKTIF</span>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span>{formatDistance(routesData.geocoding?.route_details?.distanceMeters) || 'N/A'}</span>
                        <span style={{ color: '#64748b' }}>|</span>
                        <span>{formatDuration(routesData.geocoding?.route_details?.duration) || 'N/A'}</span>
                      </div>
                    </div>

                    {/* Places */}
                    <div 
                      onClick={() => setSelectedRouteAPI('places')}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', padding: '8px 10px', borderRadius: '8px', background: selectedRouteAPI === 'places' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.04)', border: selectedRouteAPI === 'places' ? '2px solid rgba(59, 130, 246, 0.6)' : '1px solid rgba(59, 130, 246, 0.1)', cursor: 'pointer', transition: 'all 0.2s ease' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input 
                          type="checkbox" 
                          checked={visibilityFlags.places}
                          onChange={(e) => setVisibilityFlags(prev => ({ ...prev, places: e.target.checked }))}
                          onClick={(e) => e.stopPropagation()}
                          style={{ accentColor: '#3b82f6', cursor: 'pointer' }}
                        />
                        <span style={{ color: '#3b82f6', fontWeight: 700 }}>🔵 Places API</span>
                        {selectedRouteAPI === 'places' && <span style={{ fontSize: '8px', background: 'rgba(59, 130, 246, 0.25)', color: '#3b82f6', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>◀ AKTIF</span>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span>{formatDistance(routesData.places?.route_details?.distanceMeters) || 'N/A'}</span>
                        <span style={{ color: '#64748b' }}>|</span>
                        <span>{formatDuration(routesData.places?.route_details?.duration) || 'N/A'}</span>
                      </div>
                    </div>

                  </div>
                  <div style={{ fontSize: '9px', color: '#94a3b8', marginTop: '8px', textAlign: 'center', lineHeight: '1.4' }}>
                    🖱️ <strong>Klik baris</strong> untuk memilih rute aktif (Timeline & Navigasi). ☑️ <strong>Centang</strong> untuk tampil/sembunyikan rute di peta.
                  </div>
                </div>
              )}

              {!loading && currentWaypoints.length === 0 && (
                <div className="empty-state">
                  <HelpCircle size={40} className="empty-state-icon" />
                  <p>Belum ada rute aktif.</p>
                  <small>Unggah screenshot pesanan di atas untuk memulai pencarian rute pintar kurir.</small>
                </div>
              )}

              {!loading && currentWaypoints.length > 0 && (
                <>
                  {/* Route Summary Banner (if details exist) */}
                  {currentRouteDetails && (
                    <div className="route-summary-banner">
                      <div className="summary-stat">
                        <span className="summary-label">Total Jarak ({currentRouteAPI.toUpperCase()})</span>
                        <span className="summary-value">{formatDistance(currentRouteDetails.distanceMeters)}</span>
                      </div>
                      <div className="summary-stat" style={{ borderLeft: '1px solid rgba(255, 255, 255, 0.1)', paddingLeft: '16px' }}>
                        <span className="summary-label">Waktu Tempuh</span>
                        <span className="summary-value">{formatDuration(currentRouteDetails.duration)}</span>
                      </div>
                    </div>
                  )}

                  {/* Waypoints Timeline List */}
                  <div className="timeline-list">
                    {currentWaypoints.map((wp, idx) => {
                      const isCompleted = !!completedSteps[idx];
                      let badgeClass = 'badge-driver';
                      let badgeText = 'D';

                      if (wp.type === 'pickup') {
                        badgeClass = 'badge-pickup';
                        badgeText = 'P';
                      } else if (wp.type === 'delivery') {
                        badgeClass = 'badge-delivery';
                        badgeText = 'D';
                      }

                      return (
                        <div key={idx} className={`timeline-item ${isCompleted ? 'completed' : ''}`}>
                          <div className={`timeline-badge ${badgeClass}`}>
                            {badgeText}
                          </div>
                          
                          <div className="timeline-content">
                            <div className="timeline-info">
                              <div className="timeline-title-row">
                                <span className={`timeline-type-pill ${wp.type === 'pickup' ? 'pill-pickup' : wp.type === 'delivery' ? 'pill-delivery' : 'pill-pickup'}`} style={{ display: wp.type === 'driver' ? 'none' : 'inline-block' }}>
                                  {wp.type === 'pickup' ? 'Ambil' : 'Kirim'}
                                </span>
                                <span className="timeline-name">{wp.name}</span>
                              </div>
                              <span className="timeline-address">{wp.address || 'Posisi Awal Kurir'}</span>
                            </div>

                            <div className="timeline-actions">
                              {/* Deep Link Navigation (disable for driver start location) */}
                              {wp.type !== 'driver' && (
                                <a 
                                  href={`https://www.google.com/maps/dir/?api=1&destination=${wp.coordinates.lat},${wp.coordinates.lng}&travelmode=two-wheeler`}
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="nav-link-btn"
                                  title="Navigasi ke lokasi ini"
                                >
                                  <Navigation size={14} />
                                </a>
                              )}

                              {/* Complete Step Checkbox */}
                              <label className="checkbox-wrapper">
                                <input 
                                  type="checkbox" 
                                  checked={isCompleted} 
                                  onChange={() => toggleStepCompleted(idx)}
                                  className="checkbox-input"
                                />
                                <div className="custom-checkbox">
                                  ✓
                                </div>
                              </label>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Master Navigation Link (Open whole route) */}
                  {currentNavigationLink && (
                    <a 
                      href={currentNavigationLink} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="action-btn"
                      style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)', marginTop: '20px' }}
                    >
                      <Navigation size={16} />
                      <span>Buka Navigasi Rute Utuh (Google Maps - {currentRouteAPI.toUpperCase()})</span>
                    </a>
                  )}
                </>
              )}
        </div>

      </div>

      {/* RIGHT AREA: Fullscreen Interactive Map */}
      <div className="map-container glass-panel" style={{ padding: 0 }}>
        <MapComponent 
          waypoints={currentWaypoints} 
          encodedPolyline={currentRouteDetails?.polyline?.encodedPolyline} 
          routesData={routesData}
          visibilityFlags={visibilityFlags}
        />
        {currentNavigationLink && (
          <a 
            href={currentNavigationLink} 
            target="_blank" 
            rel="noopener noreferrer" 
            className="map-navigation-fab"
          >
            <Navigation size={18} />
            <span>Navigasi Google Maps ({currentRouteAPI.toUpperCase()})</span>
          </a>
        )}
      </div>

    </div>
  );
}
