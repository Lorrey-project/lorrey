import { useEffect } from 'react';

export const useTableNavigation = (containerRef) => {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleKeyDown = (e) => {
      // Find the currently focused element
      const activeEl = document.activeElement;
      
      // We only care if the focused element is within our container
      if (!container.contains(activeEl)) return;

      const isInput = activeEl.tagName === 'INPUT' || activeEl.tagName === 'SELECT' || activeEl.tagName === 'TEXTAREA';
      
      // Determine what to do based on the key
      const key = e.key;
      let nextElement = null;

      // Helper to find focusable inputs in a matrix
      const getMatrix = () => {
        const rows = Array.from(container.querySelectorAll('tr'));
        return rows.map(row => 
          Array.from(row.querySelectorAll('input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'))
        ).filter(row => row.length > 0);
      };

      const matrix = getMatrix();
      if (matrix.length === 0) return;

      let rIdx = -1;
      let cIdx = -1;

      for (let r = 0; r < matrix.length; r++) {
        const c = matrix[r].indexOf(activeEl);
        if (c !== -1) {
          rIdx = r;
          cIdx = c;
          break;
        }
      }

      if (rIdx === -1 || cIdx === -1) return; // Not found in our matrix

      const isAtStart = isInput && activeEl.selectionStart === 0;
      const isAtEnd = isInput && activeEl.selectionEnd === activeEl.value?.length;
      
      // If the input is not a text input (e.g. checkbox, select), we can navigate freely
      const isFreeNav = !isInput || activeEl.type === 'checkbox' || activeEl.type === 'radio' || activeEl.tagName === 'SELECT';

      if (key === 'ArrowUp') {
        if (rIdx > 0) nextElement = matrix[rIdx - 1][cIdx] || matrix[rIdx - 1][matrix[rIdx - 1].length - 1];
        e.preventDefault();
      } else if (key === 'ArrowDown') {
        if (rIdx < matrix.length - 1) nextElement = matrix[rIdx + 1][cIdx] || matrix[rIdx + 1][matrix[rIdx + 1].length - 1];
        e.preventDefault();
      } else if (key === 'ArrowLeft' && (isFreeNav || isAtStart)) {
        if (cIdx > 0) nextElement = matrix[rIdx][cIdx - 1];
        if (nextElement) e.preventDefault();
      } else if (key === 'ArrowRight' && (isFreeNav || isAtEnd)) {
        if (cIdx < matrix[rIdx].length - 1) nextElement = matrix[rIdx][cIdx + 1];
        if (nextElement) e.preventDefault();
      } else if (key === 'Enter') {
        // Excel style Enter goes down, Shift+Enter goes up
        if (e.shiftKey) {
          if (rIdx > 0) nextElement = matrix[rIdx - 1][cIdx];
        } else {
          if (rIdx < matrix.length - 1) nextElement = matrix[rIdx + 1][cIdx];
        }
        if (nextElement) e.preventDefault();
      } else if (key === 'PageDown') {
        const nextR = Math.min(matrix.length - 1, rIdx + 10);
        nextElement = matrix[nextR][cIdx] || matrix[nextR][matrix[nextR].length - 1];
        e.preventDefault();
      } else if (key === 'PageUp') {
        const nextR = Math.max(0, rIdx - 10);
        nextElement = matrix[nextR][cIdx] || matrix[nextR][matrix[nextR].length - 1];
        e.preventDefault();
      } else if (key === 'Home') {
        if (e.ctrlKey) {
           nextElement = matrix[0][cIdx];
        } else {
           nextElement = matrix[rIdx][0];
        }
        e.preventDefault();
      } else if (key === 'End') {
        if (e.ctrlKey) {
           nextElement = matrix[matrix.length - 1][cIdx];
        } else {
           nextElement = matrix[rIdx][matrix[rIdx].length - 1];
        }
        e.preventDefault();
      }

      if (nextElement) {
        nextElement.focus();
        if (nextElement.tagName === 'INPUT' && (nextElement.type === 'text' || nextElement.type === 'number')) {
            setTimeout(() => nextElement.select(), 0);
        }
      }
    };

    container.addEventListener('keydown', handleKeyDown);
    return () => {
      container.removeEventListener('keydown', handleKeyDown);
    };
  }, [containerRef]);
};
