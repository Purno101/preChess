(() => {
  window.addEventListener('load', initEditModule);

  function initEditModule() {
    // --- module state ---
    let editMode = false;
    let currentLine = [];
    let sanLine = [];
    let editUndoStack = [];
    let moveLog = [];
    let repertoire = loadRepertoire();
    

function resetEditorState(fullExit = false) {
  moveLog = [];
  editUndoStack = [];
  currentLine = [];
  sanLine = [];
  if (typeof startPosition === 'function') startPosition();
  else { location.reload(); return; }

  patchHistory();
  updateCurrentLineDisplay();

  if (fullExit) {
    editMode = false;
    window.activeMode = null;
    statusEl.textContent = 'Turn: White';
    toggleEditBtn.textContent = 'Enter Edit Mode';
  }

  updateButtons();
}

    const controlPanel = document.getElementById('controlPanel') || createControlPanel();
    const statusEl = document.getElementById('status') || createStatus();
    const toggleEditBtn = getOrCreate(controlPanel, 'editBtn', 'button', 'Enter Edit Mode');
    const undoBtn = getOrCreate(controlPanel, 'undoBtn', 'button', 'Undo');
    const clearBtn = getOrCreate(controlPanel, 'clearBtn', 'button', 'Clear Line');
    const saveBtn = getOrCreate(controlPanel, 'saveBtn', 'button', 'Save Line');
    const lineNameInput = getOrCreate(controlPanel, 'lineName', 'input');
    const repertoireList = getOrCreate(controlPanel, 'repertoireList', 'select');
    const resetBtn = getOrCreate(controlPanel, 'resetBtn', 'button', 'Reset Board');
    const deleteLineBtn = getOrCreate(controlPanel, 'deleteLineBtn', 'button', 'Delete Line');
    deleteLineBtn.disabled = true;

    if (lineNameInput && lineNameInput.tagName === 'INPUT') {
      lineNameInput.type = 'text';
      lineNameInput.placeholder = 'Line name (optional)';
    }

    undoBtn.disabled = true;
    clearBtn.disabled = true;
    saveBtn.disabled = true;

    populateRepertoireList();
    updateCurrentLineDisplay();

    let _origHistoryPush = null;
    function patchHistory() {
      if (!Array.isArray(history)) {
        console.error('edit.js: expected global "history" array not found.');
        return;
      }
      _origHistoryPush = history.push.bind(history);
      history.push = function (...args) {
        if (editMode && args[0] && typeof args[0] === 'string') {
          const moveStr = args[0];
          const [fromAl, toAl] = moveStr.split('-');
          const from = algebraicToCoord(fromAl);
          const to = algebraicToCoord(toAl);

          const preSnapshot = makeSnapshot();
          editUndoStack.push(preSnapshot);

          moveLog.push({ moveStr, from, to, preSnapshot, promotionType: null });

          updateButtons();

          const res = _origHistoryPush(...args);

          setTimeout(() => {
            rebuildCurrentLine();
          }, 0);

          return res;
        } else {
          return _origHistoryPush(...args);
        }
      };
    }
    patchHistory();

    if (typeof window.promotePawn === 'function') {
      const origPromote = window.promotePawn.bind(window);
      window.promotePawn = function (type) {
        origPromote(type);
        const last = moveLog[moveLog.length - 1];
        if (last) last.promotionType = type.toLowerCase();
        setTimeout(() => rebuildCurrentLine(), 0);
      };
    }

    // --- Control Handlers ---
    
    
    toggleEditBtn.addEventListener('click', () => {
  if (!editMode) {
    if (window.activeMode === "practice") {
      alert("You must exit Practice Mode before entering Edit Mode.");
      return;
    }
    
    if (!isInitialPosition()) {
          alert('Enter Edit Mode only from the initial starting position. Use Reset Board first.');
          return;
        }
        
        window.activeMode = "edit";
        moveLog = [];
        editUndoStack = [];
        currentLine = [];
        sanLine = [];
        updateCurrentLineDisplay();
        editMode = true;
        toggleEditBtn.textContent = 'Exit Edit Mode';
        statusEl.textContent = 'Edit Mode: Play moves (both sides).';
    
  } else {
    editMode = false;
    window.activeMode = null;
    toggleEditBtn.textContent = 'Enter Edit Mode';
    statusEl.textContent = 'Exited Edit Mode.';
  }
  updateButtons();
});

    undoBtn.addEventListener('click', () => {
      undoEdit();
    });

    clearBtn.addEventListener('click', () => {
      if (!confirm('Clear current line and snapshots?')) return;
      moveLog = [];
      editUndoStack = [];
      currentLine = [];
      sanLine = [];
      if (typeof startPosition === 'function') startPosition();
      else { location.reload(); return; }
      updateCurrentLineDisplay();
      updateButtons();
    });

    saveBtn.addEventListener('click', () => {
  if (currentLine.length === 0) {
    alert('No moves to save.');
    return;
  }


  const duplicate = repertoire.some(r =>
    r.moves.length === currentLine.length &&
    r.moves.every((m, i) => m === currentLine[i])
  );
  if (duplicate) {
    alert('This line already exists in your repertoire.');
    return;
  }

  const name = (lineNameInput && lineNameInput.value) ? lineNameInput.value.trim() : '';
  const entry = {
    name: name || `Line ${repertoire.length + 1}`,
    moves: [...currentLine],
    san: [...sanLine],
    created: Date.now()
  };
  repertoire.push(entry);
  localStorage.setItem('chess_repertoire', JSON.stringify(repertoire));

  resetEditorState(true);

  populateRepertoireList();
  alert('Line saved and Edit Mode exited.');
});

    repertoireList.addEventListener('change', () => {
      const idx = repertoireList.selectedIndex;
      if (idx >= 0 && repertoire[idx]) {
        const r = repertoire[idx];
        alert(`${r.name}\n\nMoves:\n${(r.san && r.san.length ? r.san.join(' ') : r.moves.join(' '))}`);
      }
    });

    resetBtn.addEventListener('click', () => {
  if (!confirm('Reset board to initial position and clear current line?')) return;
  if (window.activeMode === "practice" && typeof exitPractice === "function") {
        exitPractice();
    }
  resetEditorState(true);  
});

    deleteLineBtn.addEventListener('click', () => {
  if (repertoire.length === 0) { alert('No saved lines to delete.'); return; }

  let deleteModeActive = true;
  
  const overlay = document.createElement('div');
  overlay.style.position = 'fixed';
  overlay.style.top = 0;
  overlay.style.left = 0;
  overlay.style.width = '100%';
  overlay.style.height = '100%';
  overlay.style.background = 'rgba(0,0,0,0.4)';
  overlay.style.zIndex = 9998;

  const menu = document.createElement('div');
  menu.style.position = 'fixed';
  menu.style.top = '50%';
  menu.style.left = '50%';
  menu.style.transform = 'translate(-50%, -50%)';
  menu.style.background = 'white';
  menu.style.border = '1px solid black';
  menu.style.padding = '15px';
  menu.style.zIndex = 9999;
  menu.style.minWidth = '200px';
  menu.style.textAlign = 'center';

  repertoire.forEach((r, i) => {
    const btn = document.createElement('button');
    btn.textContent = `${i+1}. ${r.name || `Line ${i+1}`}`;
    btn.style.display = 'block';
    btn.style.width = '100%';
    btn.style.margin = '5px 0';
    btn.addEventListener('click', () => {
      if (confirm(`Delete "${repertoire[i].name}"?`)) {
        repertoire.splice(i, 1);

        repertoire.forEach((entry, idx) => {
          if (entry.name.startsWith("Line ")) {
            entry.name = `Line ${idx + 1}`;
          }
        });

        localStorage.setItem('chess_repertoire', JSON.stringify(repertoire));
        populateRepertoireList();
        updateButtons();
        alert('Line deleted.');
      }
      closeDeleteMenu();
    });
    menu.appendChild(btn);
  });

  const cancel = document.createElement('button');
  cancel.textContent = 'Cancel';
  cancel.style.marginTop = '10px';
  cancel.style.width = '100%';
  cancel.addEventListener('click', closeDeleteMenu);
  menu.appendChild(cancel);

  document.body.appendChild(overlay);
  document.body.appendChild(menu);

  function closeDeleteMenu() {
    if (overlay.parentNode) document.body.removeChild(overlay);
    if (menu.parentNode) document.body.removeChild(menu);
    deleteModeActive = false;
  }


  document.addEventListener('click', blockWhileDeleting, true);
  function blockWhileDeleting(e) {
    if (deleteModeActive && !menu.contains(e.target)) {
      e.stopPropagation();
      e.preventDefault();
    } else if (!deleteModeActive) {
      document.removeEventListener('click', blockWhileDeleting, true);
    }
  }
});

    // --- Helper Functions---
    function updateButtons() {
      undoBtn.disabled = !editMode || editUndoStack.length === 0;
      clearBtn.disabled = !editMode || (currentLine.length === 0 && editUndoStack.length === 0);
      saveBtn.disabled = !editMode || currentLine.length === 0;
      deleteLineBtn.disabled = repertoire.length === 0;
    }

    function updateCurrentLineDisplay() {
      let dispEl = document.getElementById('currentLineDisplay');
      if (!dispEl) {
        dispEl = document.createElement('div');
        dispEl.id = 'currentLineDisplay';
        dispEl.style.fontFamily = 'monospace';
        dispEl.style.fontSize = '13px';
        dispEl.style.marginTop = '6px';
        controlPanel.appendChild(dispEl);
      }
      dispEl.textContent = sanLine.length ? sanLine.join('  ') : '(no moves yet)';
    }

    function populateRepertoireList() {
      repertoireList.innerHTML = '';
      repertoire.forEach((r, i) => {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = r.name || `Line ${i+1}`;
        repertoireList.appendChild(opt);
      });
      if (repertoire.length === 0) {
        const opt = document.createElement('option');
        opt.textContent = '(no saved lines)';
        repertoireList.appendChild(opt);
      }
    }

    function loadRepertoire() {
      try { return JSON.parse(localStorage.getItem('chess_repertoire') || '[]'); }
      catch (e) { return []; }
    }

    function makeSnapshot() {
      return {
        board: deepCopyBoard(gameBoard),
        turn,
        castlingRights: { ...castlingRights },
        enPassant: enPassant ? { ...enPassant } : null,
        history: [...history]
      };
    }

    function restoreSnapshot(snapshot) {
      gameBoard = deepCopyBoard(snapshot.board);
      turn = snapshot.turn;
      castlingRights = { ...snapshot.castlingRights };
      enPassant = snapshot.enPassant ? { ...snapshot.enPassant } : null;
      history.length = 0;
      snapshot.history.forEach(h => history.push(h));
      render();
    }

    function rebuildCurrentLine() {
      const results = [];
      const backup = {
        board: deepCopyBoard(gameBoard),
        turn,
        castlingRights: { ...castlingRights },
        enPassant: enPassant ? { ...enPassant } : null
      };
      for (const ctx of moveLog) {
        const base = computeSANBase(ctx.preSnapshot, ctx.from, ctx.to, ctx.promotionType);
        gameBoard = deepCopyBoard(ctx.preSnapshot.board);
        turn = ctx.preSnapshot.turn;
        castlingRights = { ...ctx.preSnapshot.castlingRights };
        enPassant = ctx.preSnapshot.enPassant ? { ...ctx.preSnapshot.enPassant } : null;
        executeMove(ctx.from, ctx.to, true);
        turn = (turn === 'w') ? 'b' : 'w';
        const suffix = computeCheckMateSuffix(ctx.preSnapshot.turn, ctx.preSnapshot.turn === 'w' ? 'b' : 'w');
        results.push(base + suffix);
      }
      gameBoard = backup.board;
      turn = backup.turn;
      castlingRights = backup.castlingRights;
      enPassant = backup.enPassant;
      currentLine = moveLog.map(ctx => ctx.moveStr);
      sanLine = results;
      updateCurrentLineDisplay();
      updateButtons();
    }

    function undoEdit() {
      if (editUndoStack.length === 0) return;
      const lastSnapshot = editUndoStack.pop();
      if (moveLog.length > 0) moveLog.pop();
      restoreSnapshot(lastSnapshot);
      rebuildCurrentLine();
    }

    function computeCheckMateSuffix(movingColor, opponentColor) {
      const kingPos = getKingPosition(opponentColor);
      if (!kingPos) return '';
      const inCheck = isSquareAttacked(kingPos.r, kingPos.c, movingColor);
      const mate = isCheckmate(opponentColor);
      if (mate) return '#';
      if (inCheck) return '+';
      return '';
    }

    function computeSANBase(snapshot, from, to, promotionType) {
      const backup = {
        board: deepCopyBoard(gameBoard),
        turn,
        castlingRights: { ...castlingRights },
        enPassant: enPassant ? { ...enPassant } : null
      };
      gameBoard = deepCopyBoard(snapshot.board);
      turn = snapshot.turn;
      castlingRights = { ...snapshot.castlingRights };
      enPassant = snapshot.enPassant ? { ...snapshot.enPassant } : snapshot.enPassant;
      const fileChar = c => 'abcdefgh'[c];
      const piece = getPiece(from.r, from.c);
      if (!piece) { gameBoard = backup.board; turn = backup.turn; castlingRights = backup.castlingRights; enPassant = backup.enPassant; return ''; }
      if (piece.type === 'k' && Math.abs(from.c - to.c) === 2) {
        const castleSAN = (to.c === 6) ? 'O-O' : 'O-O-O';
        gameBoard = backup.board; turn = backup.turn; castlingRights = backup.castlingRights; enPassant = backup.enPassant;
        return castleSAN;
      }
      const target = getPiece(to.r, to.c);
      const isEnPassantCapture = (piece.type === 'p' && snapshot.enPassant &&
        snapshot.enPassant.r === to.r && snapshot.enPassant.c === to.c && from.c !== to.c && !target);
      const isCapture = !!target || isEnPassantCapture || (piece.type === 'p' && from.c !== to.c && !target);
      let san = '';
      if (piece.type !== 'p') san += piece.type.toUpperCase();
      if (piece.type !== 'p') {
        const others = [];
        for (let r = 0; r < 8; r++) {
          for (let c = 0; c < 8; c++) {
            if (r === from.r && c === from.c) continue;
            const p = getPiece(r, c);
            if (p && p.type === piece.type && p.color === piece.color) {
              const moves = getLegalMoves(r, c);
              if (moves.some(m => m.r === to.r && m.c === to.c)) others.push({ r, c });
            }
          }
        }
        if (others.length > 0) {
          const needFile = others.some(o => o.c !== from.c);
          const needRank = others.some(o => o.r !== from.r);
          if (needFile) san += fileChar(from.c);
          else if (needRank) san += (8 - from.r);
          else san += fileChar(from.c);
        }
      } else {
        if (isCapture) san += fileChar(from.c);
      }
      if (isCapture) san += 'x';
      san += fileChar(to.c) + (8 - to.r);
      if (promotionType) san += '=' + promotionType.toUpperCase();
      gameBoard = backup.board; turn = backup.turn; castlingRights = backup.castlingRights; enPassant = backup.enPassant;
      return san;
    }

    function getKingPosition(color) {
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const p = getPiece(r, c);
          if (p && p.type === 'k' && p.color === color) return { r, c };
        }
      }
      return null;
    }

    function isInitialPosition() {
      if (turn !== 'w') return false;
      if (history.length !== 0) return false;
      const back = ['r','n','b','q','k','b','n','r'];
      for (let c = 0; c < 8; c++) {
        const p0 = getPiece(0, c);
        const p1 = getPiece(1, c);
        const p6 = getPiece(6, c);
        const p7 = getPiece(7, c);
        if (!p0 || p0.color !== 'b' || p0.type !== back[c]) return false;
        if (!p1 || p1.color !== 'b' || p1.type !== 'p') return false;
        if (!p6 || p6.color !== 'w' || p6.type !== 'p') return false;
        if (!p7 || p7.color !== 'w' || p7.type !== back[c]) return false;
      }
      return true;
    }

    function getOrCreate(container, id, tag = 'button', label = '') {
      const found = document.getElementById(id) || (container && container.querySelector('#' + id));
      if (found) return found;
      const el = document.createElement(tag);
      el.id = id;
      if (tag.toLowerCase() === 'button') el.textContent = label;
      if (container) container.appendChild(el);
      else document.body.appendChild(el);
      return el;
    }
    function createControlPanel() {
      const panel = document.createElement('div');
      panel.id = 'controlPanel';
      panel.style.display = 'flex';
      panel.style.flexDirection = 'column';
      panel.style.gap = '8px';
      panel.style.padding = '8px';
      panel.style.background = '#fff';
      panel.style.borderRadius = '8px';
      panel.style.boxShadow = '0 6px 18px rgba(0,0,0,0.12)';
      document.body.appendChild(panel);
      return panel;
    }
    function createStatus() {
      const s = document.createElement('div');
      s.id = 'status';
      s.textContent = 'Turn: White';
      document.body.insertBefore(s, document.body.firstChild);
      return s;
    }

    window._editModule = { rebuildCurrentLine, moveLog, editUndoStack, currentLine, sanLine };
    updateButtons();
    updateCurrentLineDisplay();
  }
})();
