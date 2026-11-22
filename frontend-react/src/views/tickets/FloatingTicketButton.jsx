import { useState, useEffect, useRef } from 'react';
import TicketModal from './TicketModal';
import { getMisTickets } from '../../services/ticketService';
import './TicketModal.css';

export default function FloatingTicketButton({ worker }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [porCalificar, setPorCalificar] = useState(0);

  const btnRef = useRef(null);
  const dragRef = useRef({
    inicio: null,
    arrastrado: false,
    timerArrastrado: null,
  });

  // Consultar tickets pendientes por calificar
  useEffect(() => {
    if (!worker?.identificacion) return;

    let cancel = false;
    const checkTickets = async () => {
      try {
        const data = await getMisTickets(worker.identificacion);
        if (!cancel && typeof data.porCalificar === 'number') {
          setPorCalificar(data.porCalificar);
        }
      } catch (err) {
        // Silencioso en background
      }
    };

    checkTickets();
    const interval = setInterval(checkTickets, 60000); // Cada 60s
    return () => {
      cancel = true;
      clearInterval(interval);
    };
  }, [worker?.identificacion]);

  // Manejo de arrastre (pointer drag & snap)
  useEffect(() => {
    const btn = btnRef.current;
    if (!btn) return;

    const UMBRAL = 6;
    const MARGEN = 16;

    const ubicar = (x, y) => {
      const w = btn.offsetWidth || 100;
      const h = btn.offsetHeight || 44;
      const maxX = window.innerWidth - w - MARGEN;
      const maxY = window.innerHeight - h - MARGEN;
      const clampedX = Math.max(MARGEN, Math.min(maxX, x));
      const clampedY = Math.max(MARGEN, Math.min(maxY, y));

      btn.style.left = `${clampedX}px`;
      btn.style.top = `${clampedY}px`;
      btn.style.right = 'auto';
      btn.style.bottom = 'auto';
    };

    const onPointerDown = (e) => {
      // Ignorar clicks con botón secundario
      if (e.button !== 0) return;
      const r = btn.getBoundingClientRect();
      dragRef.current.inicio = {
        id: e.pointerId,
        px: e.clientX,
        py: e.clientY,
        x: r.left,
        y: r.top,
        moviendo: false,
      };
      btn.setPointerCapture?.(e.pointerId);
    };

    const onPointerMove = (e) => {
      const ini = dragRef.current.inicio;
      if (!ini || e.pointerId !== ini.id) return;
      const dx = e.clientX - ini.px;
      const dy = e.clientY - ini.py;

      if (!ini.moviendo) {
        if (Math.hypot(dx, dy) < UMBRAL) return;
        ini.moviendo = true;
        btn.classList.add('tkb-arrastrando');
      }

      e.preventDefault();
      ubicar(ini.x + dx, ini.y + dy);
    };

    const onPointerUp = (e) => {
      const ini = dragRef.current.inicio;
      if (!ini || (e && e.pointerId !== ini.id)) return;

      if (ini.moviendo) {
        dragRef.current.arrastrado = true;
        clearTimeout(dragRef.current.timerArrastrado);
        dragRef.current.timerArrastrado = setTimeout(() => {
          dragRef.current.arrastrado = false;
        }, 300);

        btn.classList.remove('tkb-arrastrando');
        const r = btn.getBoundingClientRect();
        const alBordeDerecho = r.left + r.width / 2 > window.innerWidth / 2;
        const targetX = alBordeDerecho ? window.innerWidth - r.width - MARGEN : MARGEN;

        btn.classList.add('tkb-pegando');
        ubicar(targetX, r.top);
        setTimeout(() => {
          btn.classList.remove('tkb-pegando');
        }, 250);
      }

      dragRef.current.inicio = null;
    };

    btn.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);

    const onResize = () => {
      if (!btn.style.left) return;
      const r = btn.getBoundingClientRect();
      ubicar(r.left, r.top);
    };
    window.addEventListener('resize', onResize);

    return () => {
      btn.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  const handleClick = () => {
    if (dragRef.current.arrastrado) return;
    setModalOpen(true);
  };

  return (
    <>
      <button
        type="button"
        ref={btnRef}
        className="tkb-flotante"
        style={{
          bottom: 'calc(76px + max(16px, var(--safe-bottom, 0px)))',
          right: '16px',
        }}
        onClick={handleClick}
        title={
          porCalificar > 0
            ? `Reportar un ticket · ${porCalificar} por calificar`
            : 'Reportar un ticket'
        }
        aria-label="Reportar un ticket"
      >
        <span className="tkb-flotante-icon">🎫</span>
        <span className="tkb-label">Ticket</span>
        {porCalificar > 0 && (
          <span className="tkb-punto-boton" title="Tickets por calificar">
            {porCalificar}
          </span>
        )}
      </button>

      <TicketModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        worker={worker}
        onTicketChanged={(n) => setPorCalificar(n)}
      />
    </>
  );
}
