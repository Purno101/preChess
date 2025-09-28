// --- Global mode flags ---
window.activeMode = null; // can be "edit", "practice", or null

// --- Elements ---
const boardEl = document.getElementById("board");
const statusEl = document.getElementById("status");
const promotionPanel = document.getElementById('promotionPanel');

const flipBtn = document.getElementById("flipBtn");
flipBtn.addEventListener("click", () => {
    flipped = !flipped;
    render();
});

// --- Game state ---
let gameBoard = [];
let turn = 'w';
let selected = null;
let legalMoves = [];
let history = [];
let flipped = false;
let castlingRights = { wK:true, wQ:true, bK:true, bQ:true };
let enPassant = null;
let pendingPromotion = null;

// --- Helpers ---
const isInside = (r,c) => r>=0 && r<8 && c>=0 && c<8;
const getPiece = (r,c) => isInside(r,c) ? gameBoard[r][c] : null;
const deepCopyBoard = b => b.map(row => row.map(cell => cell ? {...cell} : null));
const coordToAlgebraic = (r,c) => String.fromCharCode(97+c) + (8-r);
const algebraicToCoord = s => ({ c: s.charCodeAt(0)-97, r: 8-parseInt(s[1],10) });

// --- Move helpers ---
const addMoveIfValid = (moves,r,c) => {
    if(!isInside(r,c)) return;
    const target = getPiece(r,c);
    if(!target || target.color!==turn) moves.push({r,c});
};

const getPawnMoves = (r,c) => {
    const moves = [];
    const dir = turn==='w' ? -1 : 1;
    const startRow = turn==='w' ? 6 : 1;

    if(!getPiece(r+dir,c)) moves.push({r:r+dir,c});
    if(r===startRow && !getPiece(r+dir,c) && !getPiece(r+2*dir,c)) moves.push({r:r+2*dir,c,ep:true});

    for(const dc of [-1,1]){
        if((getPiece(r+dir,c+dc) && getPiece(r+dir,c+dc).color!==turn) ||
           (enPassant && enPassant.r===r && enPassant.c===c+dc)) {
            moves.push({r:r+dir,c:c+dc, ep: enPassant && enPassant.r===r && enPassant.c===c+dc});
        }
    }
    return moves;
};

const getKnightMoves = (r,c) => {
    const moves = [];
    [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]].forEach(([dr,dc])=>addMoveIfValid(moves,r+dr,c+dc));
    return moves;
};

// robust sliding moves (uses existing isInside and getPiece)
const getSlidingMoves = (r, c, directions) => {
  const moves = [];
  const piece = getPiece(r, c);
  if (!piece) return moves;

  for (const [dr, dc] of directions) {
    let nr = r + dr, nc = c + dc;
    while (isInside(nr, nc)) {
      const target = getPiece(nr, nc);
      if (!target) {
        moves.push({ r: nr, c: nc });
      } else {
        // Can capture enemy, but must stop
        if (target.color !== piece.color) {
          moves.push({ r: nr, c: nc, capture: true });
        }
        break; // stop at first blocker ALWAYS
      }
      nr += dr;
      nc += dc;
    }
  }

  return moves;
};

const getBishopMoves = (r,c) => getSlidingMoves(r,c,[[-1,-1],[-1,1],[1,-1],[1,1]]);
const getRookMoves   = (r,c) => getSlidingMoves(r,c,[[-1,0],[1,0],[0,-1],[0,1]]);
const getQueenMoves  = (r,c) => getSlidingMoves(r,c,[[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]]);

const getKingMoves = (r, c, allowCastling = true) => {
    const moves = getSlidingMoves(r, c, [
        [-1,-1],[-1,1],[1,-1],[1,1],
        [-1,0],[1,0],[0,-1],[0,1]
    ]).filter(m => Math.abs(m.r - r) <= 1 && Math.abs(m.c - c) <= 1);
    
    if (!allowCastling) return moves; // stop here, no castling check

    const enemy = turn === 'w' ? 'b' : 'w';
    const row = (turn === 'w') ? 7 : 0;
    
    console.log("getKingMoves: turn =", turn, "castlingRights =", JSON.stringify(castlingRights));
    
    // --- Force fresh castling check every time ---
    if (turn === 'w') {
        if (castlingRights.wK && !getPiece(row,5) && !getPiece(row,6)) {
            if (
                !isSquareAttacked(row,4,enemy) &&
                !isSquareAttacked(row,5,enemy) &&
                !isSquareAttacked(row,6,enemy)
            ) {
                moves.push({ r: row, c: 6, castle: 'K' });
            }
        }
        if (castlingRights.wQ && !getPiece(row,1) && !getPiece(row,2) && !getPiece(row,3)) {
            if (
                !isSquareAttacked(row,4,enemy) &&
                !isSquareAttacked(row,3,enemy) &&
                !isSquareAttacked(row,2,enemy)
            ) {
                moves.push({ r: row, c: 2, castle: 'Q' });
            }
        }
    } else {
        if (castlingRights.bK && !getPiece(row,5) && !getPiece(row,6)) {
            if (
                !isSquareAttacked(row,4,enemy) &&
                !isSquareAttacked(row,5,enemy) &&
                !isSquareAttacked(row,6,enemy)
            ) {
                moves.push({ r: row, c: 6, castle: 'K' });
            }
        }
        if (castlingRights.bQ && !getPiece(row,1) && !getPiece(row,2) && !getPiece(row,3)) {
            if (
                !isSquareAttacked(row,4,enemy) &&
                !isSquareAttacked(row,3,enemy) &&
                !isSquareAttacked(row,2,enemy)
            ) {
                moves.push({ r: row, c: 2, castle: 'Q' });
            }
        }
    }

    return moves;
};

// --- King safety ---
const getKingPosition = color => {
    for(let r=0;r<8;r++) for(let c=0;c<8;c++){
        const p=getPiece(r,c);
        if(p && p.type==='k' && p.color===color) return {r,c};
    }
    return null;
};

// --- Square attack check (no castling generation while checking attacks) ---
// Replace your isSquareAttacked with this improved version
const isSquareAttacked = (r, c, byColor) => {
  const origTurn = turn;
  // We'll not rely on getPawnMoves here; handle pawn attacks directly
  const enemy = byColor;

  // Helper to report and restore
  const report = (attackerType, i, j) => {
    console.log(`isSquareAttacked: square (${r},${c}) attacked by ${attackerType} at (${i},${j})`);
  };

  // Loop enemy pieces and check attacks
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      const p = getPiece(i, j);
      if (!p || p.color !== enemy) continue;

      const t = p.type.toLowerCase();

      // Pawns: attack diagonally one step forward (from their perspective),
      // independent of whether there's a piece there.
      if (t === 'p') {
        const dir = (p.color === 'w') ? -1 : 1;
        const ar = i + dir;
        if (ar === r && (j - 1 === c || j + 1 === c)) {
          report('p', i, j);
          return true;
        }
        continue; // done with this pawn
      }

      // King: use king moves but disable castling
      if (t === 'k') {
        const kmoves = getKingMoves(i, j, false);
        if (Array.isArray(kmoves) && kmoves.some(m => m.r === r && m.c === c)) {
          report('k', i, j);
          return true;
        }
        continue;
      }

      // For all other pieces, use getRawMoves with allowCastling=false
      // (Rooks/Bishops/Queens/Knights)
      const moves = getRawMoves(i, j, false);
      if (Array.isArray(moves) && moves.some(m => m.r === r && m.c === c)) {
        report(p.type, i, j);
        return true;
      }
    }
  }

  // nothing found
  return false;
};

// --- Helper: does the piece at (r,c) attack targetR,targetC? ---
const isSquareAttacking = (r, c, targetR, targetC) => {
    const piece = getPiece(r, c);
    if (!piece) return false;

    const moves = piece.type.toLowerCase() === 'k'
        ? getKingMoves(r, c, false)
        : getRawMoves(r, c, false);

    return Array.isArray(moves) && moves.some(m => m.r === targetR && m.c === targetC);
};

// --- Checkmate detection ---
const isCheckmate = color => {
    const pieces = [];
    for(let r=0;r<8;r++) for(let c=0;c<8;c++){
        const p = getPiece(r,c);
        if(p && p.color===color) pieces.push({r,c,type:p.type});
    }
    for(const p of pieces){
        for(const m of getLegalMoves(p.r,p.c)){
            const backupBoard = deepCopyBoard(gameBoard);
            const backupTurn = turn;
            executeMove({r:p.r,c:p.c}, m, true);
            const kingPos = getKingPosition(color);
            if(!isSquareAttacked(kingPos.r,kingPos.c,color==='w'?'b':'w')) { gameBoard=backupBoard; turn=backupTurn; return false; }
            gameBoard=backupBoard; turn=backupTurn;
        }
    }
    return true;
};

const getCheckmatingPieces = color => {
    const kingPos = getKingPosition(color);
    if(!kingPos) return [];
    const enemyColor = color==='w' ? 'b' : 'w';
    const pieces = [];
    for(let r=0;r<8;r++) for(let c=0;c<8;c++){
        const p = getPiece(r,c);
        if(p && p.color===enemyColor && getLegalMoves(r,c).some(m=>m.r===kingPos.r && m.c===kingPos.c)){
            pieces.push({r,c});
        }
    }
    return pieces;
};

// --- Move generators ---
// --- Raw moves (robust, accepts allowCastling) ---
const getRawMoves = (r, c, allowCastling = true) => {
    const p = getPiece(r, c);
    if (!p) return [];

    // normalize type so we don't break if types are 'k' or 'K'
    const t = p.type.toLowerCase();

    switch (t) {
        case 'p': return getPawnMoves(r, c);
        case 'n': return getKnightMoves(r, c);
        case 'b': return getBishopMoves(r, c);
        case 'r': return getRookMoves(r, c);
        case 'q': return getQueenMoves(r, c);
        case 'k': return getKingMoves(r, c, allowCastling);
        default: return [];
    }
};

const getLegalMoves = (r,c) => {
    const piece = getPiece(r,c);
    if(!piece || piece.color!==turn) return [];
    const legal = [];
    for(const m of getRawMoves(r,c)){
        const backupBoard = deepCopyBoard(gameBoard);
        const backupTurn = turn;
        executeMove({r,c}, m, true);
        const kingPos = getKingPosition(piece.color);
        if(!isSquareAttacked(kingPos.r,kingPos.c,piece.color==='w'?'b':'w')) legal.push(m);
        gameBoard = backupBoard; turn = backupTurn;
    }
    return legal;
};

// --- Promotion ---
const showPromotion = (from,to,color) => {
    pendingPromotion = { from,to,color };
    promotionPanel.innerHTML = '';

    // position panel beside the pawn’s square
    const squareEl = document.getElementById(`square-${to.r}-${to.c}`);
    if (squareEl) {
        const rect = squareEl.getBoundingClientRect();
        promotionPanel.style.left = `${rect.right + window.scrollX + 5}px`;
        promotionPanel.style.top = `${rect.top + window.scrollY}px`;
    }

    promotionPanel.style.display = 'flex';

    ['q','r','b','n'].forEach(type => {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("viewBox", "0 0 45 45");
        svg.setAttribute("width", "45");
        svg.setAttribute("height", "45");

        const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
        use.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", `#${piece.color}${piece.type.toUpperCase()}`);
        svg.appendChild(use);

        svg.classList.add('piece');
        svg.style.cursor = 'pointer';
        svg.addEventListener('click', () => promotePawn(type));

        promotionPanel.appendChild(svg);
    });
};


const promotePawn = type => {
    const {from,to,color} = pendingPromotion;
    gameBoard[to.r][to.c] = {type,color};
    gameBoard[from.r][from.c] = null;
    pendingPromotion=null; promotionPanel.style.display='none';
    render();
    turn = turn==='w'?'b':'w'; 
};

// --- Execute move (robust: castling, en-passant, promotion, simulation safe) ---
function executeMove(from, to, simulate = false) {
    const piece = gameBoard[from.r][from.c];
    if (!piece) return;

    const target = gameBoard[to.r][to.c];
    
    console.log("Before move, rights:", JSON.stringify(castlingRights), "move:", from, "->", to, "simulate:", simulate);

    // record history only for real moves
    if (!simulate) {
        history.push(`${coordToAlgebraic(from.r,from.c)}-${coordToAlgebraic(to.r,to.c)}`);
    }

    // En passant capture (if pawn moves to an ep square and target is empty)
    if (piece.type === 'p' && to.ep && !target) {
        const capRow = (piece.color === 'w') ? to.r + 1 : to.r - 1;
        gameBoard[capRow][to.c] = null;
    }

    // Promotion: for real moves, open promotion UI and return (do not change turn here)
    if (!simulate && piece.type === 'p' && (to.r === 0 || to.r === 7)) {
        // set pendingPromotion source and destination so promotePawn can finalize it
        pendingPromotion = { from, to, color: piece.color };
        showPromotion(from, to, piece.color);
        return;
    }

    // Castling special handling (ensure both king and rook are moved consistently)
if (piece.type === 'k' && to.castle) {
    const row = piece.color === 'w' ? 7 : 0;

    if (to.castle === 'K') {
        // King moves
        gameBoard[row][6] = piece;
        gameBoard[from.r][from.c] = null;
        // Rook moves
        const rook = gameBoard[row][7];
        if (rook) {
            gameBoard[row][5] = rook;
            gameBoard[row][7] = null;
        }
    } else if (to.castle === 'Q') {
        // King moves
        gameBoard[row][2] = piece;
        gameBoard[from.r][from.c] = null;
        // Rook moves
        const rook = gameBoard[row][0];
        if (rook) {
            gameBoard[row][3] = rook;
            gameBoard[row][0] = null;
        }
    }

    // After castling, disable castling rights
    if (piece.color === 'w') castlingRights.wK = castlingRights.wQ = false;
    else castlingRights.bK = castlingRights.bQ = false;

} else {
    // Normal move
    gameBoard[to.r][to.c] = piece;
    gameBoard[from.r][from.c] = null;
}

    // Update castling rights when king or rook moves/captured
    if (piece.type === 'k') {
        if (piece.color === 'w') { castlingRights.wK = false; castlingRights.wQ = false; }
        else { castlingRights.bK = false; castlingRights.bQ = false; }
    }
    if (piece.type === 'r') {
        if (from.r === 7 && from.c === 0) castlingRights.wQ = false;
        if (from.r === 7 && from.c === 7) castlingRights.wK = false;
        if (from.r === 0 && from.c === 0) castlingRights.bQ = false;
        if (from.r === 0 && from.c === 7) castlingRights.bK = false;
    }
    // If a rook was captured, also clear corresponding rights
    if (target && target.type === 'r') {
        if (to.r === 7 && to.c === 0) castlingRights.wQ = false;
        if (to.r === 7 && to.c === 7) castlingRights.wK = false;
        if (to.r === 0 && to.c === 0) castlingRights.bQ = false;
        if (to.r === 0 && to.c === 7) castlingRights.bK = false;
    }
    
    console.log("After move, rights:", JSON.stringify(castlingRights));

    // Setup enPassant for possible capture next move
    enPassant = (piece.type === 'p' && Math.abs(to.r - from.r) === 2)
        ? { r: Math.floor((from.r + to.r) / 2), c: from.c }
        : null;

    // Finalize: only flip turn and render if not simulating
    if (!simulate) {
        turn = turn === 'w' ? 'b' : 'w';
        
        // Force castling recalculation after every move
        
        render();
    }
}

// Wrapper to make a move
const makeMove = (from,to) => executeMove(from,to);

// --- Click handler ---
// --- Click handler ---
// --- Click handler ---
const onSquareClick = e => {
    const r = parseInt(e.currentTarget.dataset.r);
    const c = parseInt(e.currentTarget.dataset.c);
    const clickedPiece = getPiece(r, c);

    if (selected) {
        // find the matching move object (this object may contain flags like .castle or .ep)
        const move = legalMoves.find(m => m.r === r && m.c === c);
        if (move) {
            const from = { r: selected.r, c: selected.c };
            // use the full move object so we keep .castle, .ep, etc.
            const to = { ...move }; // shallow copy is fine

            makeMove(from, to); // Executes move and renders

            // Practice mode logic (keeps your original behavior)
            if (typeof onPlayerMove === "function") {
                const moveStr = `${coordToAlgebraic(from.r, from.c)}-${coordToAlgebraic(to.r, to.c)}`;
                console.log("Player move detected:", moveStr);

                // inside onSquareClick, after makeMove(...)
                if (practiceMode) {
                  const moveStr = `${coordToAlgebraic(from.r, from.c)}-${coordToAlgebraic(to.r, to.c)}`;

                  // Prefer the handler from practice.js (if present)
                  if (typeof onPlayerMove === "function") {
                    onPlayerMove(moveStr);
                  } else {
                    // Fallback: inline behavior but DO NOT overwrite status after computerMove()
                    if (practiceLine[practiceIndex] === moveStr) {
                      practiceIndex++;
                      practiceStatus.textContent = "✔ Correct move!";
                      undoBtn.style.display = "none";

                      setTimeout(() => {
                        computerMove();
                        // IMPORTANT: do NOT set practiceStatus here — computerMove() decides final message
                      }, 300);
                    } else {
                      practiceStatus.textContent = "❌ Wrong move, try again.";
                      undoBtn.style.display = "inline-block";
                      undoLastMove();
                    }
                  }
                }
            }

            selected = null;
            legalMoves = [];
            render();
            return;
        }
    }

    if (clickedPiece && clickedPiece.color === turn) {
        selected = { r, c };
        legalMoves = getLegalMoves(r, c);
        render();
    }
};
// --- Rendering ---
// --- Rendering ---
const render = () => {
    boardEl.innerHTML = '';
    const rows = [...Array(8).keys()];
    const cols = [...Array(8).keys()];
    if (flipped) {
        rows.reverse();
        cols.reverse();
    }

    const whiteKingPos = getKingPosition('w');
    const blackKingPos = getKingPosition('b');

    const whiteInCheck = whiteKingPos && isSquareAttacked(whiteKingPos.r, whiteKingPos.c, 'b');
    const blackInCheck = blackKingPos && isSquareAttacked(blackKingPos.r, blackKingPos.c, 'w');

    const whiteCheckmate = whiteInCheck && isCheckmate('w');
    const blackCheckmate = blackInCheck && isCheckmate('b');

    const whiteCheckmatingPieces = whiteCheckmate ? getCheckmatingPieces('w') : [];
    const blackCheckmatingPieces = blackCheckmate ? getCheckmatingPieces('b') : [];

    // --- Status display ---
    statusEl.textContent = whiteCheckmate ? "Black wins!" :
                           blackCheckmate ? "White wins!" :
                           `Turn: ${turn === 'w' ? 'White' : 'Black'}`;

    for (const r of rows) {
        for (const c of cols) {
            const sq = document.createElement('div');
            sq.className = 'square ' + ((r + c) % 2 === 0 ? 'light' : 'dark');
            sq.dataset.r = r;
            sq.dataset.c = c;
            sq.id = `square-${r}-${c}`;

            const piece = getPiece(r, c);
            if (piece) {
                const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
                svg.setAttribute("viewBox", "0 0 45 45");
                svg.setAttribute("width", "45");
                svg.setAttribute("height", "45");

                const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
                use.setAttributeNS("http://www.w3.org/1999/xlink", "href", `#${piece.color}${piece.type.toUpperCase()}`);
                svg.appendChild(use);
                svg.classList.add('piece');
                sq.appendChild(svg);
            }

            // Highlight selected piece and legal moves
            if (selected && selected.r === r && selected.c === c) sq.classList.add('highlight');
            if (legalMoves.some(m => m.r === r && m.c === c)) sq.classList.add('mover');

            // Highlight king in check
            if ((whiteInCheck && r === whiteKingPos.r && c === whiteKingPos.c) ||
                (blackInCheck && r === blackKingPos.r && c === blackKingPos.c)) {
                sq.classList.add('check');
            }

            // Highlight king in checkmate
            if ((whiteCheckmate && r === whiteKingPos.r && c === whiteKingPos.c) ||
                (blackCheckmate && r === blackKingPos.r && c === blackKingPos.c)) {
                sq.classList.add('checkmate');
            }

            // Highlight pieces delivering checkmate
            if (piece && (
                whiteCheckmatingPieces.some(p => p.r === r && p.c === c) ||
                blackCheckmatingPieces.some(p => p.r === r && p.c === c)
            )) {
                sq.classList.add('checkmate-piece');
            }

            sq.addEventListener('click', onSquareClick);
            boardEl.appendChild(sq);
        }
    }
};

// --- Initialize game ---
const startPosition = () => {
    gameBoard = Array.from({ length: 8 }, () => Array(8).fill(null));
    const back = ['r','n','b','q','k','b','n','r'];
    for (let c = 0; c < 8; c++) {
        gameBoard[0][c] = { type: back[c], color: 'b' };
        gameBoard[1][c] = { type: 'p', color: 'b' };
        gameBoard[6][c] = { type: 'p', color: 'w' };
        gameBoard[7][c] = { type: back[c], color: 'w' };
    }
    turn = 'w';
    selected = null;
    legalMoves = [];
    history = [];
    castlingRights = { wK:true, wQ:true, bK:true, bQ:true };
    enPassant = null;
    render();
};

// --- Start game ---
startPosition();