export class DOMSearch {
  constructor() {
    this.matches = [];
    this.activeIndex = -1;
    this.query = '';
  }

  // Clear all highlights
  clear() {
    this.matches.forEach(match => {
      if (match.parent && match.nodes) {
        match.nodes.forEach(n => {
          if (n.parentNode === match.parent) {
            match.parent.replaceChild(document.createTextNode(n.textContent), n);
          }
        });
        match.parent.normalize(); // merge text nodes back
      }
    });
    this.matches = [];
    this.activeIndex = -1;
    this.query = '';
  }

  // Find and highlight text in the DOM
  search(query) {
    this.clear();
    if (!query || query.trim() === '') return 0;
    
    this.query = query.toLowerCase();
    
    // We only search within the main content area to avoid highlighting menus/navs
    const root = document.querySelector('main') || document.body;
    
    const treeWalker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: function(node) {
          // Skip script, style, noscript, etc.
          const parentTag = node.parentNode.tagName.toLowerCase();
          if (['script', 'style', 'noscript', 'title', 'meta'].includes(parentTag)) {
            return NodeFilter.FILTER_REJECT;
          }
          // Skip empty nodes
          if (!node.textContent.trim()) {
             return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      },
      false
    );

    const nodesToProcess = [];
    let currentNode = treeWalker.nextNode();
    while (currentNode) {
      if (currentNode.textContent.toLowerCase().includes(this.query)) {
        nodesToProcess.push(currentNode);
      }
      currentNode = treeWalker.nextNode();
    }

    // Process nodes in reverse to avoid messing up earlier node references
    // Actually for TextNode splitting, doing it sequentially is fine if we process one at a time and replace them.
    for (const node of nodesToProcess) {
      this.highlightNode(node);
    }
    
    if (this.matches.length > 0) {
      this.setActive(0);
    }

    return this.matches.length;
  }

  highlightNode(textNode) {
    const text = textNode.textContent;
    const lowerText = text.toLowerCase();
    const parent = textNode.parentNode;
    
    // Safety check: if parent doesn't contain the node anymore, skip
    if (!parent.contains(textNode)) return;

    let index = lowerText.indexOf(this.query);
    if (index === -1) return;

    const fragment = document.createDocumentFragment();
    let lastIdx = 0;
    const createdNodes = [];

    while (index !== -1) {
      if (index > lastIdx) {
        fragment.appendChild(document.createTextNode(text.substring(lastIdx, index)));
      }
      
      const mark = document.createElement('mark');
      mark.className = 'global-search-highlight';
      mark.style.backgroundColor = 'yellow';
      mark.style.color = 'black';
      mark.style.borderRadius = '2px';
      mark.textContent = text.substring(index, index + this.query.length);
      fragment.appendChild(mark);
      createdNodes.push(mark);
      
      this.matches.push({ parent, nodes: [mark] });
      
      lastIdx = index + this.query.length;
      index = lowerText.indexOf(this.query, lastIdx);
    }
    
    if (lastIdx < text.length) {
      fragment.appendChild(document.createTextNode(text.substring(lastIdx)));
    }
    
    parent.replaceChild(fragment, textNode);
  }

  setActive(index) {
    if (this.matches.length === 0) return;
    
    // Reset previous active
    if (this.activeIndex >= 0 && this.activeIndex < this.matches.length) {
       this.matches[this.activeIndex].nodes.forEach(n => {
           n.style.backgroundColor = 'yellow';
           n.className = 'global-search-highlight';
       });
    }

    this.activeIndex = index;
    const activeMatch = this.matches[this.activeIndex];
    
    if (activeMatch) {
       activeMatch.nodes.forEach(n => {
           n.style.backgroundColor = 'orange';
           n.className = 'global-search-highlight active';
       });
       
       // Scroll into view
       activeMatch.nodes[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  next() {
    if (this.matches.length === 0) return;
    const nextIdx = (this.activeIndex + 1) % this.matches.length;
    this.setActive(nextIdx);
  }

  prev() {
    if (this.matches.length === 0) return;
    const prevIdx = (this.activeIndex - 1 + this.matches.length) % this.matches.length;
    this.setActive(prevIdx);
  }
}

export const globalSearch = new DOMSearch();
