import { useEffect, useMemo, useState } from 'react';
import { getHistory, filterRecords, deriveJornadas, periodShortcutRange } from '../models/historyModel';
import { reverseGeocode } from '../services/geocodingService';
import { saveHistoryCache, getHistoryCache } from '../services/offlineDb';
import { isConnectivityFailure } from '../services/connectivity';

function formatDateInput(date) {
  return date ? date.toISOString().split('T')[0] : '';
}

function bogotaNow() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function useRecordsController({ identificacion, onBack }) {
  const [records, setRecords] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [tab, setTab] = useState('marcaciones');
  const [tipoFilter, setTipoFilter] = useState('all');
  const [activePeriod, setActivePeriod] = useState('today');
  const [desde, setDesde] = useState(() => periodShortcutRange('today').desde);
  const [hasta, setHasta] = useState(() => periodShortcutRange('today').hasta);

  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const [mapTarget, setMapTarget] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(bogotaNow()));

  useEffect(() => {
    if (!identificacion) return;
    let mounted = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await getHistory(identificacion, 200);
        if (!mounted) return;
        setRecords(res.records);
        setTotal(res.total);
        saveHistoryCache(res.records).catch(() => {});
      } catch (err) {
        if (!mounted) return;
        if (isConnectivityFailure(err)) {
          const cached = await getHistoryCache();
          if (!mounted) return;
          if (cached.length) {
            setRecords(cached);
            setTotal(cached.length);
          } else {
            setError(err.message);
          }
        } else {
          setError(err.message);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [identificacion]);

  const filteredRecords = useMemo(
    () => filterRecords(records, { tipo: tipoFilter, desde, hasta }),
    [records, tipoFilter, desde, hasta]
  );

  const jornadas = useMemo(() => deriveJornadas(records, { desde, hasta }), [records, desde, hasta]);

  const hasOpenEntry = useMemo(() => {
    const list = tab === 'marcaciones' ? filteredRecords : jornadas;
    return list.some((rec) => rec.tipo === 'ENTRADA' && !rec.fecha_salida);
  }, [tab, filteredRecords, jornadas]);

  useEffect(() => {
    if (!hasOpenEntry) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [hasOpenEntry]);

  const weekDays = useMemo(() => {
    const offset = (selectedDate.getDay() - 6 + 7) % 7;
    const start = new Date(selectedDate);
    start.setDate(selectedDate.getDate() - offset);
    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date(start);
      day.setDate(start.getDate() + i);
      return day;
    });
  }, [selectedDate]);

  const dayRecords = useMemo(() => {
    const dayStart = startOfDay(selectedDate);
    const dayEnd = new Date(dayStart);
    dayEnd.setHours(23, 59, 59, 999);
    return records
      .filter((rec) => {
        const d = new Date(rec.fecha_hora);
        return d >= dayStart && d <= dayEnd;
      })
      .sort((a, b) => new Date(b.fecha_hora) - new Date(a.fecha_hora));
  }, [records, selectedDate]);

  const weekTotalMs = useMemo(() => {
    const weekStart = startOfDay(weekDays[0]);
    const weekEnd = new Date(startOfDay(weekDays[6]));
    weekEnd.setHours(23, 59, 59, 999);
    return records
      .filter((rec) => rec.tipo_registro === 'marcacion' && rec.tipo === 'ENTRADA' && rec.fecha_salida)
      .filter((rec) => {
        const d = new Date(rec.fecha_hora);
        return d >= weekStart && d <= weekEnd;
      })
      .reduce((sum, rec) => sum + Math.max(0, new Date(rec.fecha_salida) - new Date(rec.fecha_hora)), 0);
  }, [records, weekDays]);

  const weekComplianceRatio = useMemo(() => {
    const weekStart = startOfDay(weekDays[0]);
    const weekLastDay = startOfDay(weekDays[6]);
    const today = startOfDay(bogotaNow());
    const weekEndCap = weekLastDay < today ? weekLastDay : today;
    if (weekEndCap < weekStart) return null;

    const daysElapsed = Math.round((weekEndCap - weekStart) / 86400000) + 1;

    const completeDays = new Set();
    records
      .filter((rec) => rec.tipo_registro === 'marcacion' && rec.tipo === 'ENTRADA' && rec.fecha_salida)
      .forEach((rec) => {
        const dayStart = startOfDay(new Date(rec.fecha_hora));
        if (dayStart >= weekStart && dayStart <= weekEndCap) {
          completeDays.add(dayStart.getTime());
        }
      });

    return daysElapsed > 0 ? completeDays.size / daysElapsed : null;
  }, [records, weekDays]);

  function selectDate(date) {
    setSelectedDate(startOfDay(date));
  }

  function jumpToDate(isoValue) {
    if (!isoValue) return;
    selectDate(new Date(`${isoValue}T00:00:00`));
  }

  function selectPeriod(period) {
    setActivePeriod(period);
    const range = periodShortcutRange(period);
    setDesde(range.desde);
    setHasta(range.hasta);
  }

  function changeDesde(value) {
    setActivePeriod(null);
    setDesde(value ? new Date(`${value}T00:00:00`) : null);
  }

  function changeHasta(value) {
    setActivePeriod(null);
    setHasta(value ? new Date(`${value}T23:59:59`) : null);
  }

  function toggleExpanded(id) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openMap(lat, lng, label) {
    setMapTarget({ lat, lng, label, address: null, addressStatus: 'loading' });
    reverseGeocode(lat, lng)
      .then((address) => {
        setMapTarget((prev) => (prev && prev.lat === lat && prev.lng === lng ? { ...prev, address, addressStatus: 'ready' } : prev));
      })
      .catch(() => {
        setMapTarget((prev) => (prev && prev.lat === lat && prev.lng === lng ? { ...prev, addressStatus: 'error' } : prev));
      });
  }

  function closeMap() {
    setMapTarget(null);
  }

  return {
    loading,
    error,
    total,
    tab,
    setTab,
    tipoFilter,
    setTipoFilter,
    activePeriod,
    selectPeriod,
    desdeInput: formatDateInput(desde),
    hastaInput: formatDateInput(hasta),
    changeDesde,
    changeHasta,
    records: filteredRecords,
    jornadas,
    expandedIds,
    toggleExpanded,
    mapTarget,
    openMap,
    closeMap,
    now,
    onBack,
    selectedDate,
    selectDate,
    jumpToDate,
    weekDays,
    dayRecords,
    weekTotalMs,
    weekComplianceRatio,
  };
}
