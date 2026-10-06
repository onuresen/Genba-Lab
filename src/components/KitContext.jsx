import React, { createContext, useContext, useState, useEffect } from 'react';
import { inferStcRating, inferSupplyRisk, inferThermalConductivity } from '../utils/materialMetrics';

const KitContext = createContext();

const DEFAULT_PROJECT = {
  name: 'IC Kit',
  currency: 'USD',
  jpyRate: 155,
  standard: 'UK',
  casbee_building_type: 'residential',
  casbee_target_rank: 'A',
};

function normalizeParts(parts) {
  return (parts || []).map(part => ({
    ...part,
    variants: (part.variants || []).map(variant => ({
      ...variant,
      thermal_conductivity_wpmk: variant.thermal_conductivity_wpmk ?? inferThermalConductivity(variant),
      supply_risk: variant.supply_risk ?? inferSupplyRisk(variant),
      stc_rating: variant.stc_rating ?? inferStcRating(variant),
    })),
  }));
}

export function KitProvider({ children }) {
  const [parts, setPartsInternal] = useState([]);
  const [presets, setPresets] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [projectSettings, setProjectSettings] = useState(DEFAULT_PROJECT);

  // Undo/redo history
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const canUndo = undoStack.length > 0;
  const canRedo = redoStack.length > 0;

  // setParts with history tracking
  function setParts(fnOrParts) {
    setPartsInternal(prev => {
      const next = typeof fnOrParts === 'function' ? fnOrParts(prev) : fnOrParts;
      setUndoStack(stack => [...stack.slice(-29), prev]);
      setRedoStack([]);
      return next;
    });
  }

  // setParts without history (used for load/reset)
  function setPartsNoHistory(fnOrParts) {
    setPartsInternal(fnOrParts);
    setUndoStack([]);
    setRedoStack([]);
  }

  function undo() {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setUndoStack(s => s.slice(0, -1));
    setPartsInternal(current => {
      setRedoStack(s => [...s.slice(-9), current]);
      return prev;
    });
  }

  function redo() {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack(s => s.slice(0, -1));
    setPartsInternal(current => {
      setUndoStack(s => [...s.slice(-29), current]);
      return next;
    });
  }

  // Currency formatter
  function formatCurrency(usd) {
    if (projectSettings.currency === 'JPY') {
      const jpy = Math.round(usd * projectSettings.jpyRate);
      return `¥${jpy.toLocaleString()}`;
    }
    return `$${usd.toLocaleString()}`;
  }

  // Restore the last imported IFC model. Anything else (e.g. an old block kit
  // from before the fork dropped sample kits) is ignored: the app starts empty.
  useEffect(() => {
    try {
      const data = JSON.parse(localStorage.getItem('genba-lab-model') ?? 'null');
      if (data?.projectSettings?.source?.type === 'ifc' && data.parts?.length) {
        setPartsInternal(normalizeParts(data.parts));
        setPresets(data.presets || []);
        setProjectSettings({ ...DEFAULT_PROJECT, ...data.projectSettings });
      }
    } catch {
      // Corrupt save: start empty.
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (!isLoading && parts.length > 0) {
      localStorage.setItem('genba-lab-model', JSON.stringify({ parts, presets, projectSettings }));
    }
  }, [parts, presets, projectSettings, isLoading]);

  // Load an in-memory kit (used by IFC import).
  const loadKitData = (data) => {
    setPartsNoHistory(normalizeParts(data.parts))
    setPresets(data.presets || [])
    setProjectSettings({ ...DEFAULT_PROJECT, ...data.projectSettings })
  }

  const updatePartSequences = (orderedIds) => {
    const order = new Map(orderedIds.map((id, idx) => [id, idx + 1]));
    setParts(prev => prev.map(p => order.has(p.id) ? { ...p, sequence: order.get(p.id) } : p));
  };

  const addConnection = (fromId, conn) => {
    setParts(prev => prev.map(p => {
      if (p.id === fromId) {
        if ((p.connections ?? []).some(c => c.to === conn.to && c.type === conn.type)) return p;
        return { ...p, connections: [...(p.connections ?? []), conn] };
      }
      if (p.id === conn.to) {
        const reverse = { to: fromId, type: conn.type, hardware: conn.hardware };
        if ((p.connections ?? []).some(c => c.to === fromId && c.type === conn.type)) return p;
        return { ...p, connections: [...(p.connections ?? []), reverse] };
      }
      return p;
    }));
  };

  const removeConnection = (fromId, connTo) => {
    setParts(prev => prev.map(p => {
      if (p.id === fromId) return { ...p, connections: (p.connections ?? []).filter(c => c.to !== connTo) };
      if (p.id === connTo)  return { ...p, connections: (p.connections ?? []).filter(c => c.to !== fromId) };
      return p;
    }));
  };

  const savePreset = (label, selectedVariants, visible) => {
    const id = label.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '-' + Date.now().toString().slice(-4);
    const newPreset = {
      id,
      label,
      description: `Custom preset – ${label}`,
      custom: true,
      variants: { ...selectedVariants },
      visible: { ...visible },
    };
    setPresets([...presets, newPreset]);
  };

  const removePreset = (id) => {
    setPresets(presets.filter(p => p.id !== id));
  };

  return (
    <KitContext.Provider value={{
      parts, presets, setPresets,
      projectSettings, setProjectSettings, formatCurrency,
      loadKitData, isLoading,
      updatePartSequences,
      savePreset, removePreset, addConnection, removeConnection,
      undo, redo, canUndo, canRedo,
    }}>
      {children}
    </KitContext.Provider>
  );
}

export function useKit() {
  return useContext(KitContext);
}
