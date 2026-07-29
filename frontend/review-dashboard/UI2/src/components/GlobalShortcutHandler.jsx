import React, { useEffect, useState, useContext } from 'react';
import SearchOverlay from './SearchOverlay';
import { ShortcutContext } from '../context/ShortcutContext';

export default function GlobalShortcutHandler() {
  const [searchOpen, setSearchOpen] = useState(false);
  const shortcutContext = useContext(ShortcutContext);

  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't intercept if user is typing in a standard input (unless it's a specific global combo like Ctrl+S or Ctrl+F)
      const activeEl = document.activeElement;
      const isInput = activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable;

      let keyCombo = [];
      if (e.ctrlKey || e.metaKey) keyCombo.push('ctrl');
      if (e.shiftKey) keyCombo.push('shift');
      if (e.altKey) keyCombo.push('alt');
      keyCombo.push(e.key.toLowerCase());

      const comboStr = keyCombo.join('+');

      // Special Global Handlers
      if (comboStr === 'ctrl+f') {
        e.preventDefault();
        setSearchOpen(true);
        return;
      }
      
      if (comboStr === 'escape' && searchOpen) {
        setSearchOpen(false);
        // We let the event propagate if we want, or stop it here
      }

      // If they are in an input and pressing basic keys (like Delete, or letters), let default happen
      // But allow Ctrl+S, Ctrl+E etc.
      if (isInput && !e.ctrlKey && !e.metaKey && e.key !== 'Escape') {
        return; 
      }

      // Check if context has a registered handler for this combo
      if (shortcutContext) {
        const handled = shortcutContext.triggerShortcut(comboStr, e);
        if (handled) {
          e.preventDefault();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [shortcutContext, searchOpen]);

  return (
    <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
  );
}
