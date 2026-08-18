import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

export const ShortcutContext = createContext(null);

export const ShortcutProvider = ({ children }) => {
  const [handlers, setHandlers] = useState({});

  const registerShortcut = useCallback((keyCombo, handler) => {
    setHandlers((prev) => ({
      ...prev,
      [keyCombo.toLowerCase()]: handler,
    }));
  }, []);

  const unregisterShortcut = useCallback((keyCombo) => {
    setHandlers((prev) => {
      const newHandlers = { ...prev };
      delete newHandlers[keyCombo.toLowerCase()];
      return newHandlers;
    });
  }, []);

  const triggerShortcut = useCallback((keyCombo, event) => {
    const handler = handlers[keyCombo.toLowerCase()];
    if (handler) {
      handler(event);
      return true; // Handled
    }
    return false; // Not handled
  }, [handlers]);

  return (
    <ShortcutContext.Provider value={{ registerShortcut, unregisterShortcut, triggerShortcut }}>
      {children}
    </ShortcutContext.Provider>
  );
};

// Hook to register a shortcut in a component
export const useShortcut = (keyCombo, handler) => {
  const context = useContext(ShortcutContext);
  const handlerRef = React.useRef(handler);

  if (!context) {
    console.warn('useShortcut must be used within a ShortcutProvider');
    return;
  }

  React.useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  React.useEffect(() => {
    const stableHandler = (e) => {
      if (handlerRef.current) {
        handlerRef.current(e);
      }
    };

    if (handler) {
      context.registerShortcut(keyCombo, stableHandler);
      return () => {
        context.unregisterShortcut(keyCombo);
      };
    }
  }, [keyCombo, context]);
};
