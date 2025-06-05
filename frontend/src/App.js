import React, { useEffect, useState } from 'react';
// import './index.css'; // Pokud máte CSS soubor, odkomentujte
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

// DŮLEŽITÉ: Ujistěte se, že toto je správná adresa API vašeho učitele
const TEACHER_API_BASE_URL = 'http://127.0.0.1:5000'; 

function App() {
  const [config, setConfig] = useState(null);
  const [status, setStatus] = useState(null);
  const [measurements, setMeasurements] = useState([]);
  const [bufferSize, setBufferSize] = useState(25); // Lokální buffer size
  const [errorLog, setErrorLog] = useState([]); // Pro zobrazení chyb v UI

  const [showVoltagePos, setShowVoltagePos] = useState(true);
  const [showVoltageNeg, setShowVoltageNeg] = useState(false);
  const [showCurrentPos, setShowCurrentPos] = useState(true);
  const [showCurrentNeg, setShowCurrentNeg] = useState(false);

  const voltagePosColor = 'rgba(255, 150, 150, 1)';
  const voltagePosBgColor = 'rgba(255, 150, 150, 0.2)';
  const voltageNegColor = 'rgba(200, 50, 50, 1)';
  const voltageNegBgColor = 'rgba(200, 50, 50, 0.2)';
  const currentPosColor = 'rgba(0, 200, 200, 1)';
  const currentPosBgColor = 'rgba(0, 200, 200, 0.5)';
  const currentNegColor = 'rgba(0, 0, 200, 1)';
  const currentNegBgColor = 'rgba(0, 0, 200, 0.5)';

  const logError = (message, errorObj) => {
    const timestamp = new Date().toLocaleTimeString();
    // Zajistíme, že errorObj.message existuje
    const errorMessage = errorObj && errorObj.message ? errorObj.message : 'Neznámá chyba fetch';
    const fullMessage = `[${timestamp}] ${message}: ${errorMessage}`;
    console.error(fullMessage, errorObj); 
    setErrorLog(prevLog => [`${fullMessage} (Viz konzole pro detaily)`, ...prevLog].slice(0, 5)); 
  };

  const mapNumericPolarityToString = (numericPolarity) => {
    switch (numericPolarity) {
      case 0: return "positive";
      case 1: return "negative";
      case 2: return "bipolar (pozitivní první)";
      case 3: return "bipolar"; 
      default: return `unknown (${numericPolarity})`;
    }
  };
  
  const isBipolar = (numericPolarity) => numericPolarity === 2 || numericPolarity === 3;

  const mapNumericMeasurementTypeToString = (numericType) => {
    switch (numericType) {
      case 0: return "voltage";
      case 1: return "current";
      case 2: return "both"; 
      default: return `unknown (${numericType})`;
    }
  };

  useEffect(() => {
    const url = `${TEACHER_API_BASE_URL}/api/remotecontrol/readconfiguration`;
    console.log("DEBUG: Načítání konfigurace z URL:", url);
    fetch(url)
      .then(res => {
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status} for ${url}.`);
        }
        return res.json();
      })
      .then(data => {
        console.log("DEBUG: Konfigurace z API zařízení načtena:", data);
        setConfig(data);

        const bipolar = isBipolar(data.polarity);
        const measuresVoltage = data.measurementType === 0 || data.measurementType === 2;
        const measuresCurrent = data.measurementType === 1 || data.measurementType === 2;

        setShowVoltagePos(measuresVoltage);
        setShowVoltageNeg(bipolar && measuresVoltage);
        setShowCurrentPos(measuresCurrent);
        setShowCurrentNeg(bipolar && measuresCurrent);
      })
      .catch(error => logError("Chyba při načítání konfigurace z API zařízení", error));
  }, []);

  const filterOutBadValues = (measuredValuesArray) => {
    if (!Array.isArray(measuredValuesArray)) return [];
    return measuredValuesArray.filter(mv => 
      (mv.posCurrent !== null && mv.posCurrent !== -32768) ||
      (mv.posVoltage !== null && mv.posVoltage !== -32768) || // Přidáno pro případ, že by napětí mělo hodnoty
      (mv.negCurrent !== null && mv.negCurrent !== -32768) ||
      (mv.negVoltage !== null && mv.negVoltage !== -32768)
    );
  };

  useEffect(() => {
    const fetchData = () => {
      const statusUrl = `${TEACHER_API_BASE_URL}/api/remotecontrol/readstatus`;
      console.log("DEBUG: Načítání statusu z URL:", statusUrl);
      fetch(statusUrl) 
        .then(res => {
          if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status} for ${statusUrl}.`);
          }
          return res.json();
        })
        .then(currentStatus => {
          console.log("DEBUG: Status z API zařízení načten:", currentStatus);
          setStatus(currentStatus);
          console.log("DEBUG: currentStatus.hasNewMeasureData =", currentStatus.hasNewMeasureData);

          if (currentStatus.hasNewMeasureData) { // Ponecháváme standardní logiku
            console.log("DEBUG: Podmínka pro načtení měření splněna (hasNewMeasureData je true).");
            const measurementsUrl = `${TEACHER_API_BASE_URL}/api/remotecontrol/ReadMeasureStorage`;
            console.log("DEBUG: Načítání měření z URL:", measurementsUrl);
            fetch(measurementsUrl)
              .then(res => {
                if (!res.ok) {
                  throw new Error(`HTTP error! status: ${res.status} for ${measurementsUrl}.`);
                }
                return res.json();
              })
              .then(data => {
                console.log("DEBUG: Surová data měření z API zařízení:", data);
                const rawMeasurements = data.measuredStorage || [];
                console.log("DEBUG: rawMeasurements (data.measuredStorage):", rawMeasurements);

                let processed = rawMeasurements.map(m => ({
                  ...m,
                  measuredValues: filterOutBadValues(m.measuredValues)
                }));
                console.log("DEBUG: processed po filterOutBadValues:", processed);

                processed = processed.filter(m => m.measuredValues && m.measuredValues.length > 0);
                console.log("DEBUG: processed po odfiltrování prázdných measuredValues:", processed);
                
                if (bufferSize > 0 && processed.length > bufferSize) {
                  processed = processed.slice(-bufferSize); // Vezmeme jen posledních N záznamů z konce pole
                  console.log("DEBUG: processed po oříznutí bufferem:", processed);
                }
                // Obracíme pole, aby se nejstarší data (s nižším ID) kreslila první (zleva)
                // a nejnovější (s vyšším ID) napravo.
                setMeasurements(processed.reverse()); 
                console.log("DEBUG: Finální stav 'measurements' pro graf (po reverse):", processed); // Logujeme co se nastavuje
              })
              .catch(error => logError("Chyba při načítání měření z API zařízení", error));
          } else {
            console.log("DEBUG: Podmínka currentStatus.hasNewMeasureData NENÍ splněna. Měření se nenačítají.");
            // Pokud chceme vymazat stará data, když nepřichází nová:
            // setMeasurements([]); 
          }
        })
        .catch(error => logError("Chyba při načítání statusu z API zařízení", error));
    };

    fetchData(); 
    const interval = setInterval(fetchData, 2000); // Interval pro polling

    return () => clearInterval(interval);
  }, [bufferSize]);

  const chartData = {
    labels: measurements.map(m => m.id),
    datasets: [],
  };
  console.log("DEBUG: Data pro graf - labels:", chartData.labels);


  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: {
      legend: { position: 'top', labels: { color: '#abb2bf' } },
      title: { display: false },
      tooltip: { mode: 'index', intersect: false },
    },
    scales: {
      x: {
        title: { display: true, text: 'Measurement ID', color: '#abb2bf' },
        ticks: { color: '#abb2bf', autoSkip: true, maxTicksLimit: 20 }, // Omezení počtu ticků
        grid: { color: 'rgba(255, 255, 255, 0.1)' },
      },
      yVoltage: {
        type: 'linear',
        display: 'auto',
        position: 'right',
        title: { display: true, text: 'Napětí [kV]', color: '#abb2bf' },
        ticks: { color: '#abb2bf' },
        min: config && config.minVoltage !== null ? (isBipolar(config.polarity) ? -Math.abs(config.maxVoltage / 1000) : config.minVoltage / 1000) : undefined,
        max: config && config.maxVoltage !== null ? Math.abs(config.maxVoltage / 1000) : undefined,
        grid: { color: 'rgba(255, 255, 255, 0.1)' },
      },
      yCurrent: {
        type: 'linear',
        display: 'auto',
        position: 'left',
        title: { display: true, text: 'Proud [A]', color: '#abb2bf' },
        ticks: { color: '#abb2bf' },
        min: undefined, 
        max: undefined, 
        grid: { drawOnChartArea: false },
      },
    },
  };

   const getPointStyle = (measuredValues) => {
     return measuredValues && measuredValues.length > 1 ? 'rectRot' : 'circle';
   };

  if (config && showVoltagePos && (config.measurementType === 0 || config.measurementType === 2)) {
    chartData.datasets.push({
      label: 'Napětí (kV+)',
      data: measurements.map(m => m.measuredValues && m.measuredValues[0]?.posVoltage !== null ? m.measuredValues[0]?.posVoltage / 1000 : null),
      borderColor: voltagePosColor, backgroundColor: voltagePosBgColor, yAxisID: 'yVoltage', tension: 0.1, pointRadius: 3,
      pointStyle: measurements.map(m => getPointStyle(m.measuredValues)),
    });
  }

  if (config && showVoltageNeg && isBipolar(config.polarity) && (config.measurementType === 0 || config.measurementType === 2)) {
    chartData.datasets.push({
      label: 'Napětí (kV-)',
      data: measurements.map(m => m.measuredValues && m.measuredValues[0]?.negVoltage !== null ? m.measuredValues[0]?.negVoltage / 1000 : null),
      borderColor: voltageNegColor, backgroundColor: voltageNegBgColor, yAxisID: 'yVoltage', tension: 0.1, pointRadius: 3,
      pointStyle: measurements.map(m => getPointStyle(m.measuredValues)),
    });
  }

  if (config && showCurrentPos && (config.measurementType === 1 || config.measurementType === 2)) {
    chartData.datasets.push({
      label: 'Proud (A+)',
      data: measurements.map(m => m.measuredValues && m.measuredValues[0]?.posCurrent !== null ? m.measuredValues[0]?.posCurrent : null),
      borderColor: currentPosColor, backgroundColor: currentPosBgColor, yAxisID: 'yCurrent', tension: 0.1, pointRadius: 3,
      pointStyle: measurements.map(m => getPointStyle(m.measuredValues)),
    });
  }

  if (config && showCurrentNeg && isBipolar(config.polarity) && (config.measurementType === 1 || config.measurementType === 2)) {
    chartData.datasets.push({
      label: 'Proud (A-)',
      data: measurements.map(m => m.measuredValues && m.measuredValues[0]?.negCurrent !== null ? m.measuredValues[0]?.negCurrent : null),
      borderColor: currentNegColor, backgroundColor: currentNegBgColor, yAxisID: 'yCurrent', tension: 0.1, pointRadius: 3,
      pointStyle: measurements.map(m => getPointStyle(m.measuredValues)),
    });
  }
  console.log("DEBUG: Data pro graf - datasets (po naplnění):", JSON.parse(JSON.stringify(chartData.datasets)));


  const handleToggleChange = (setter, currentState) => {
    setter(!currentState);
  };

  const containerStyle = { display: 'flex', flexDirection: 'row', padding: '20px', fontFamily: 'Arial, sans-serif', backgroundColor: '#282c34', color: '#abb2bf', minHeight: '100vh' };
  const sectionStyle = { flex: 1, margin: '10px' };
  const cardStyle = { backgroundColor: '#3c4049', padding: '20px', borderRadius: '8px', boxShadow: '0 4px 8px rgba(0, 0, 0, 0.2)' };
  const cardTitleStyle = { marginTop: '0', marginBottom: '20px', borderBottom: '1px solid #4f535c', paddingBottom: '10px' };
  const statusItemStyle = { display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px dashed #4f535c' };
  const statusLabelStyle = { fontWeight: 'bold', marginRight: '10px' };
  const dataSeriesOptionStyle = { display: 'flex', alignItems: 'center', marginBottom: '10px' };
  const colorDotStyle = { width: '15px', height: '15px', borderRadius: '50%', marginRight: '10px' };
  const toggleSwitchLabelStyle = { position: 'relative', display: 'inline-block', width: '50px', height: '24px', marginLeft: 'auto' };
  const toggleSwitchInputStyle = { opacity: 0, width: 0, height: 0 };
  const sliderStyle = (isChecked) => ({ position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: isChecked ? '#2196F3' : '#ccc', transition: '.4s', borderRadius: '24px' });
  const sliderBeforeStyle = (isChecked) => ({ position: 'absolute', content: '""', height: '16px', width: '16px', left: isChecked ? '22px' : '4px', bottom: '4px', backgroundColor: 'white', transition: '.4s', borderRadius: '50%' });
  const errorLogStyle = { marginTop: '20px', padding: '10px', backgroundColor: '#553030', border: '1px solid #a04040', borderRadius: '4px', maxHeight: '150px', overflowY: 'auto', fontSize: '0.8em' };
  const errorLogItemStyle = { marginBottom: '5px', whiteSpace: 'pre-wrap', wordBreak: 'break-all'};

  return (
    <div style={containerStyle}>
      <div style={sectionStyle}>
        <div style={cardStyle}>
          <h2 style={cardTitleStyle}>Graf</h2>
          <div style={{ position: 'relative', height: '400px', width: '100%' }}>
            {config && measurements.length > 0 ? <Line data={chartData} options={chartOptions} /> : <p>Načítání dat grafu nebo žádná data k dispozici...</p>}
          </div>
        </div>
        {errorLog.length > 0 && (
          <div style={errorLogStyle}>
            <h3 style={{marginTop:0, color: '#ffaaaa'}}>Chybové hlášky (posledních 5):</h3>
            {errorLog.map((err, index) => (
              <p key={index} style={errorLogItemStyle}>{err}</p>
            ))}
          </div>
        )}
      </div>
      <div style={sectionStyle}>
        <div style={cardStyle}>
          <h2 style={cardTitleStyle}>Stav Systému</h2>
          <div style={statusItemStyle}>
            <span style={statusLabelStyle}>Připojení</span>
            <span style={{ color: config ? 'lightgreen' : (errorLog.some(e => e.includes("konfigurace")) ? 'red' : 'orange') }}>
              {config ? 'Online (k API zařízení)' : (errorLog.some(e => e.includes("konfigurace")) ? 'Chyba konfigurace' : 'Připojování...')}
            </span>
          </div>
          <div style={statusItemStyle}>
            <span style={statusLabelStyle}>Polarita Zařízení</span>
            <span>{config ? mapNumericPolarityToString(config.polarity) : 'N/A'}</span>
          </div>
          <div style={statusItemStyle}>
            <span style={statusLabelStyle}>Typ Měření Zařízení</span> 
            <span>{config ? mapNumericMeasurementTypeToString(config.measurementType) : 'N/A'}</span>
          </div>
          <div style={statusItemStyle}>
            <span style={statusLabelStyle}>Velikost Bufferu (Frontend)</span>
            <input type="number" value={bufferSize} onChange={e => setBufferSize(parseInt(e.target.value,10) || 0)} style={{width: "50px", backgroundColor:"#282c34", color:"#abb2bf", border:"1px solid #4f535c"}}/>
          </div>
           {status && (
            <>
              <div style={statusItemStyle}>
                <span style={statusLabelStyle}>Napětí na zdroji</span>
                <span>{status.voltage !== null ? status.voltage : 'N/A'} V</span>
              </div>
              <div style={statusItemStyle}>
                <span style={statusLabelStyle}>Chyba Zařízení</span>
                <span title={status.errorCodeDescription}>{status.errorCode !== 0 ? `Kód: ${status.errorCode}` : 'OK'}</span>
              </div>
            </>
           )}
        </div>
        <div style={{...cardStyle, marginTop: '20px'}}>
          <h2 style={cardTitleStyle}>Datové Řady</h2>
          {config && (config.measurementType === 0 || config.measurementType === 2) && (
            <div style={dataSeriesOptionStyle}>
              <div style={{...colorDotStyle, backgroundColor: voltagePosColor }}></div>
              <span>Napětí (kV+)</span>
              <label style={toggleSwitchLabelStyle}>
                <input style={toggleSwitchInputStyle} type="checkbox" checked={showVoltagePos} onChange={() => handleToggleChange(setShowVoltagePos, showVoltagePos)}/>
                <span style={sliderStyle(showVoltagePos)}><span style={sliderBeforeStyle(showVoltagePos)}></span></span>
              </label>
            </div>
          )}
          {config && isBipolar(config.polarity) && (config.measurementType === 0 || config.measurementType === 2) && (
            <div style={dataSeriesOptionStyle}>
              <div style={{...colorDotStyle, backgroundColor: voltageNegColor }}></div>
              <span>Napětí (kV-)</span>
              <label style={toggleSwitchLabelStyle}>
                <input style={toggleSwitchInputStyle} type="checkbox" checked={showVoltageNeg} onChange={() => handleToggleChange(setShowVoltageNeg, showVoltageNeg)}/>
                <span style={sliderStyle(showVoltageNeg)}><span style={sliderBeforeStyle(showVoltageNeg)}></span></span>
              </label>
            </div>
          )}
          {config && (config.measurementType === 1 || config.measurementType === 2) && (
            <div style={dataSeriesOptionStyle}>
              <div style={{...colorDotStyle, backgroundColor: currentPosColor }}></div>
              <span>Proud (A+)</span>
              <label style={toggleSwitchLabelStyle}>
                <input style={toggleSwitchInputStyle} type="checkbox" checked={showCurrentPos} onChange={() => handleToggleChange(setShowCurrentPos, showCurrentPos)}/>
                <span style={sliderStyle(showCurrentPos)}><span style={sliderBeforeStyle(showCurrentPos)}></span></span>
              </label>
            </div>
          )}
          {config && isBipolar(config.polarity) && (config.measurementType === 1 || config.measurementType === 2) && (
            <div style={dataSeriesOptionStyle}>
              <div style={{...colorDotStyle, backgroundColor: currentNegColor }}></div>
              <span>Proud (A-)</span>
              <label style={toggleSwitchLabelStyle}>
                <input style={toggleSwitchInputStyle} type="checkbox" checked={showCurrentNeg} onChange={() => handleToggleChange(setShowCurrentNeg, showCurrentNeg)}/>
                <span style={sliderStyle(showCurrentNeg)}><span style={sliderBeforeStyle(showCurrentNeg)}></span></span>
              </label>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;