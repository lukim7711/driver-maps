import { useState, useRef } from 'react';
import { Upload, FileImage, Trash2, AlertCircle, MapPin, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import './App.css';

export default function App() {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null);
  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = useRef(null);

  const processIncomingFiles = (incomingFiles) => {
    if (files.length + incomingFiles.length > 5) {
      setError('Maksimal 5 gambar. Hapus file yang ada untuk menambah baru.');
      return;
    }

    const filesToAdd = incomingFiles.slice(0, 5 - files.length);
    setFiles(prev => [...prev, ...filesToAdd]);
    setError(null);
  };

  const handleFileChange = (e) => {
    if (e.target.files) {
      processIncomingFiles(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  const handleDragOver = (e) => { e.preventDefault(); setDragOver(true); };
  const handleDragLeave = (e) => { e.preventDefault(); setDragOver(false); };
  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (dropped.length > 0) processIncomingFiles(dropped);
    else setError('Hanya file gambar yang diizinkan.');
  };

  const handleRemoveFile = (idx) => {
    setFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (files.length === 0) {
      setError('Pilih minimal 1 file gambar screenshot terlebih dahulu!');
      return;
    }

    setLoading(true);
    setError(null);
    setResults(null);

    const formData = new FormData();
    files.forEach((file) => formData.append('screenshots', file));

    try {
      const API_BASE = import.meta.env.VITE_API_BASE_URL || 'https://driver-maps-api.cfkim.workers.dev';
      const response = await fetch(`${API_BASE}/api/extract-address`, {
        method: 'POST',
        body: formData
      });
      const result = await response.json();
      if (response.ok && result.success) {
        setResults(result.data);
        if (result.failed_items && result.failed_items.length > 0) {
          setError(`${result.failed_items.length} alamat gagal diproses.`);
        }
      } else {
        throw new Error(result.error || result.details || 'Terjadi kesalahan pada server.');
      }
    } catch (err) {
      console.error('Error:', err);
      setError(`Gagal memproses: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const getAccuracyBadge = (geocoding) => {
    if (!geocoding) return { label: 'Tidak diketahui', color: 'gray', icon: AlertCircle };
    if (geocoding.is_accurate) {
      return { label: 'Akurat', color: 'green', icon: CheckCircle };
    }
    if (geocoding.warning) {
      return { label: 'Kurang Akurat', color: 'yellow', icon: AlertTriangle };
    }
    return { label: 'Tidak Akurat', color: 'red', icon: XCircle };
  };

  const formatCoord = (val) => val ? val.toFixed(6) : '-';

  return (
    <div className="app-container">
      <div className="main-card">
        {/* Header */}
        <div className="header">
          <h1 className="title">
            <MapPin size={24} />
            Koordinat Akurat
          </h1>
          <p className="subtitle">Ekstrak alamat dari screenshot & tentukan titik koordinat presisi</p>
        </div>

        {/* Upload Section */}
        <div className="upload-section">
          <label
            className={`upload-zone ${dragOver ? 'dragover' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <input
              type="file"
              multiple
              accept="image/*"
              onChange={handleFileChange}
              ref={fileInputRef}
              className="hidden-input"
            />
            <Upload size={32} className="upload-icon" />
            <span className="upload-text">
              {dragOver ? 'Lepaskan file di sini' : 'Klik atau Drag File Gambar'}
            </span>
            <span className="upload-subtext">Maksimal 5 file screenshot pesanan</span>
          </label>

          {/* File List */}
          {files.length > 0 && (
            <div className="file-list">
              {files.map((file, idx) => (
                <div key={idx} className="file-chip">
                  <FileImage size={16} />
                  <span className="file-name" title={file.name}>{file.name}</span>
                  <span className="file-size">({(file.size / 1024).toFixed(0)} KB)</span>
                  <button type="button" onClick={() => handleRemoveFile(idx)} className="remove-btn">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            className="submit-btn"
            onClick={handleSubmit}
            disabled={loading || files.length === 0}
          >
            {loading ? (
              <>
                <div className="spinner"></div>
                <span>AI sedang membaca alamat...</span>
              </>
            ) : (
              <>
                <Upload size={16} />
                <span>Ekstrak Koordinat</span>
              </>
            )}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="error-box">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        {/* Results */}
        {results && results.length > 0 && (
          <div className="results-section">
            <h2 className="results-title">Hasil Ekstraksi ({results.length} pesanan)</h2>

            {results.map((order, idx) => {
              const pickupBadge = getAccuracyBadge(order.pickup?.geocoding);
              const deliveryBadge = getAccuracyBadge(order.delivery?.geocoding);
              const PickupIcon = pickupBadge.icon;
              const DeliveryIcon = deliveryBadge.icon;

              return (
                <div key={idx} className="order-card">
                  <div className="order-header">
                    <span className="order-number">Pesanan #{idx + 1}</span>
                  </div>

                  {/* Pickup */}
                  <div className="address-block">
                    <div className="address-type pickup">Pickup</div>
                    <div className="address-name">{order.pickup?.seller_name || '?'}</div>
                    <div className="address-text">{order.pickup?.address?.full_address || order.pickup?.address}</div>
                    {order.pickup?.coordinates && (
                      <div className="coord-row">
                        <span className="coord-value">
                          lat: {formatCoord(order.pickup.coordinates.lat)}, lng: {formatCoord(order.pickup.coordinates.lng)}
                        </span>
                        <span className={`accuracy-badge ${pickupBadge.color}`}>
                          <PickupIcon size={14} />
                          {pickupBadge.label}
                        </span>
                      </div>
                    )}
                    {order.pickup?.geocoding?.warning && (
                      <div className="warning-text">{order.pickup.geocoding.warning}</div>
                    )}
                  </div>

                  {/* Delivery */}
                  <div className="address-block">
                    <div className="address-type delivery">Delivery</div>
                    <div className="address-name">{order.delivery?.customer_name || '?'}</div>
                    <div className="address-text">{order.delivery?.address?.full_address || order.delivery?.address}</div>
                    {order.delivery?.coordinates && (
                      <div className="coord-row">
                        <span className="coord-value">
                          lat: {formatCoord(order.delivery.coordinates.lat)}, lng: {formatCoord(order.delivery.coordinates.lng)}
                        </span>
                        <span className={`accuracy-badge ${deliveryBadge.color}`}>
                          <DeliveryIcon size={14} />
                          {deliveryBadge.label}
                        </span>
                      </div>
                    )}
                    {order.delivery?.geocoding?.warning && (
                      <div className="warning-text">{order.delivery.geocoding.warning}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Empty State */}
        {!loading && !results && !error && (
          <div className="empty-state">
            <MapPin size={48} className="empty-icon" />
            <p>Upload screenshot pesanan untuk mulai ekstraksi koordinat.</p>
          </div>
        )}
      </div>
    </div>
  );
}
