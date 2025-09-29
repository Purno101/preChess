// practice.js — robust practice + wrong-move visualization + proper undo

// === PRACTICE VARIABLES ===
let practiceMode = false;
let practiceLine = [];
let practiceIndex = 0;
let practiceColor = "w";
let practiceHistory = []; // snapshots for practice mode
let waitingForUndo = false; // block further moves when wrong-move is shown

// === SAFE FALLBACKS (only create these if they don't already exist) ===
if (typeof globalThis.deepCopyBoard !== "function") {
  globalThis.deepCopyBoard = function(board) {
    // simple deep-copy fallback (works for your board if it contains plain data)
    return JSON.parse(JSON.stringify(board));
  };
}

if (typeof globalThis.algebraicToCoord !== "function") {
  // algebraic e.g. "e2" -> { r: 6, c: 4 } (0-indexed rows 0..7 top-to-bottom)
  globalThis.algebraicToCoord = function(al) {
    if (!al || al.length < 2) return null;
    const file = al[0].toLowerCase();
    const rank = parseInt(al[1], 10);
    if (isNaN(rank)) return null;
    const c = file.charCodeAt(0) - "a".charCodeAt(0);
    const r = 8 - rank;
    return { r, c };
  };
}

// === CONTROL PANEL SETUP ===
const controlPanel = document.getElementById("controlPanel");
const practiceBtn = getOrCreate(controlPanel, "practiceBtn", "button", "Enter Practice Mode");
const exitPracticeBtn = getOrCreate(controlPanel, "exitPracticeBtn", "button", "Exit Practice Mode");
const practiceStatus = getOrCreate(controlPanel, "practiceStatus", "div", "");
const practiceUndoBtn = getOrCreate(controlPanel, "practiceUndoBtn", "button", "Undo Move");

exitPracticeBtn.style.display = "none";
practiceUndoBtn.style.display = "none";

// === EVENTS ===
practiceBtn.addEventListener("click", startPractice);
exitPracticeBtn.addEventListener("click", exitPractice);
practiceUndoBtn.addEventListener("click", () => undoLastPracticeMove());

// === HELPERS ===
function getOrCreate(container, id, tag = "button", label = "") {
    let el = document.getElementById(id);
    if (!el) {
        el = document.createElement(tag);
        el.id = id;
        if (tag.toLowerCase() === "button") el.textContent = label;
        container.appendChild(el);
    }
    return el;
}

function savePracticeSnapshot(moveStr = null, isComputer = false, meta = {}) {
    practiceHistory.push({
        board: deepCopyBoard(gameBoard),
        turn,
        castlingRights: { ...(typeof castlingRights !== "undefined" ? castlingRights : {}) },
        enPassant: (typeof enPassant !== "undefined" && enPassant) ? { ...enPassant } : null,
        moveStr,
        isComputer,
        meta
    });
}

// small util: check if the move has already been applied to gameBoard
function isMoveAlreadyApplied(moveStr) {
    const [fromAl, toAl] = moveStr.split("-");
    const from = algebraicToCoord(fromAl);
    const to = algebraicToCoord(toAl);
    // if 'from' is empty and 'to' has a piece, assume move applied
    const fromPiece = gameBoard[from.r] && gameBoard[from.r][from.c];
    const toPiece = gameBoard[to.r] && gameBoard[to.r][to.c];
    return (!fromPiece && !!toPiece);
}

// === START PRACTICE ===
function startPractice() {

  if (window.activeMode === "edit") {
    alert("You must exit Edit Mode before starting Practice.");
    return;
  }
  
  window.activeMode = "practice";
  
  const repertoire = loadRepertoire();
    if (repertoire.length === 0) {
        alert("No saved lines found. Please create lines in Edit Mode first.");
        return;
    }

    const idx = Math.floor(Math.random() * repertoire.length);
    practiceLine = repertoire[idx].moves.slice();
    practiceIndex = 0;

    practiceColor = (prompt("Practice as (w/b)?", "w") || "w").toLowerCase() === "b" ? "b" : "w";

    practiceMode = true;
    practiceHistory = []; // reset independent history
    waitingForUndo = false;

    practiceBtn.style.display = "none";
    exitPracticeBtn.style.display = "inline-block";
    practiceUndoBtn.style.display = "none";
    practiceStatus.textContent = `Practicing "${repertoire[idx].name || "Line"}" as ${practiceColor === "w" ? "White" : "Black"}`;

    if (typeof startPosition === "function") startPosition();

    // if practising as black, computer should play the first move(s) from the line
    if (practiceColor === "b") setTimeout(computerMove, 300);

}

// === EXIT PRACTICE ===
function exitPractice() {
    practiceMode = false;
    practiceLine = [];
    practiceIndex = 0;
    waitingForUndo = false;
    window.activeMode = null;
    practiceBtn.style.display = "inline-block";
    exitPracticeBtn.style.display = "none";
    practiceUndoBtn.style.display = "none";
    practiceStatus.textContent = "Exited Practice Mode.";
    if (typeof startPosition === "function") startPosition();
}

// === PLAYER MOVE HANDLER ===
// `moveStr` expected in "e2-e4" format. This handler is robust to whether the move was already applied.
function onPlayerMove(moveStr) {
    if (!practiceMode) return;

    // block new moves while a wrong move is shown and awaiting Undo
    if (waitingForUndo) {
        practiceStatus.textContent = "Please undo the incorrect move first.";
        return;
    }

    const expectedMove = practiceLine[practiceIndex];

    const [fromAl, toAl] = moveStr.split("-");
    const fromCoord = algebraicToCoord(fromAl);
    const toCoord = algebraicToCoord(toAl);
    const applied = isMoveAlreadyApplied(moveStr);

    if (moveStr === expectedMove) {
        // ✅ Correct move
        // If the move wasn't applied by the UI yet, apply it now.
        if (!applied) {
            executeMove(fromCoord, toCoord, true);
            turn = turn === "w" ? "b" : "w";
            render();
        }

        // Save snapshot of the board AFTER the correct player move (so history remains meaningful)
        savePracticeSnapshot(moveStr, false);

        practiceIndex++;

        if (practiceIndex >= practiceLine.length) {
            practiceStatus.textContent = "🎉 Congrats! You completed the line!";
            practiceMode = false;
            practiceBtn.style.display = "inline-block";
            exitPracticeBtn.style.display = "none";
            practiceUndoBtn.style.display = "none";
            return;
        }

        practiceStatus.textContent = "✔ Correct move!";
        practiceUndoBtn.style.display = "none";

        // computer replies with next move from line
        setTimeout(() => { computerMove(); }, 300);
    } else {
        // ❌ Wrong move: we must show the wrong move but keep a PRE-MOVE snapshot
        // PRE-SNAPSHOT logic:
        // - if the move was NOT applied yet -> save the current board as PRE snapshot
        // - if the move WAS already applied -> try to use the last saved snapshot (most recent correct position)
        let preSnapshotSaved = false;

        if (!applied) {
            // Save current board BEFORE applying the wrong move
            savePracticeSnapshot(null, false, { wrongPre: true });
            preSnapshotSaved = true;

            // Now apply the wrong move to show it visually
            executeMove(fromCoord, toCoord, true);
            turn = turn === "w" ? "b" : "w";
            render();

        } else {
            // move already applied by the UI before this handler ran:
            // the PRE-move state is expected to be the last snapshot in practiceHistory (if present)
            // (that's the usual flow: after last computer move we saved a snapshot)
            if (practiceHistory.length > 0) {
                const lastSnap = practiceHistory[practiceHistory.length - 1];
                // push a copy of that snapshot as the pre-wrong snapshot (so Undo can restore it)
                practiceHistory.push({
                    board: deepCopyBoard(lastSnap.board),
                    turn: lastSnap.turn,
                    castlingRights: { ...lastSnap.castlingRights },
                    enPassant: lastSnap.enPassant ? { ...lastSnap.enPassant } : null,
                    moveStr: null,
                    isComputer: false,
                    meta: { wrongPre: true }
                });
                preSnapshotSaved = true;
            } else {
                // fallback: save a deep copy of the current board but mark fallback (rare)
                savePracticeSnapshot(null, false, { wrongPre: true, fallback: true });
                preSnapshotSaved = true;
            }
            // (no need to executeMove here because board already shows the wrong move)
        }

        if (!preSnapshotSaved) {
            // safety fallback
            savePracticeSnapshot(null, false, { wrongPre: true, fallback: true });
        }

        waitingForUndo = true;
        practiceStatus.textContent = "❌ Wrong move, try again.";
        practiceUndoBtn.style.display = "inline-block"; // show undo button
    }
}

// === COMPUTER MOVE ===
function computerMove() {
    if (!practiceMode || practiceIndex >= practiceLine.length) return;
    if (waitingForUndo) {
        // if a wrong move is showing, don't let computer act
        return;
    }

    const moveStr = practiceLine[practiceIndex];
    
    // Here we will APPLY the move and then save snapshot (so history entries reflect post-move boards).
    const [fromAl, toAl] = moveStr.split("-");
    const from = algebraicToCoord(fromAl);
    const to = algebraicToCoord(toAl);

    executeMove(from, to, true);
    turn = turn === "w" ? "b" : "w";
    render();

    savePracticeSnapshot(moveStr, true);

    practiceIndex++;

    if (practiceIndex >= practiceLine.length) {
        practiceStatus.textContent = "🎉 Congrats! You completed the line!";
        practiceMode = false;
        practiceBtn.style.display = "inline-block";
        exitPracticeBtn.style.display = "none";
        practiceUndoBtn.style.display = "none";
        return;
    }

    practiceStatus.textContent = "Computer played. Your turn!";
}

// === UNDO LAST PRACTICE MOVE ===
function undoLastPracticeMove() {
    // Find the most recent player snapshot that was saved as a pre-WRONG snapshot.
    for (let i = practiceHistory.length - 1; i >= 0; i--) {
        const snap = practiceHistory[i];
        if (!snap.isComputer && snap.meta && snap.meta.wrongPre) {
            // Restore board state exactly as it was before the wrong move
            gameBoard = deepCopyBoard(snap.board);
            turn = snap.turn;
            castlingRights = { ...snap.castlingRights };
            enPassant = snap.enPassant ? { ...snap.enPassant } : null;

            // remove that pre-wrong snapshot from history
            practiceHistory.splice(i, 1);

            waitingForUndo = false;
            render();

            practiceStatus.textContent = "Undo: try the correct move again!";
            practiceUndoBtn.style.display = "none";
            return;
        }
    }

    // If we didn't find a pre-wrong snapshot, hide the button as a safe fallback.
    waitingForUndo = false;
    practiceUndoBtn.style.display = "none";
    practiceStatus.textContent = "Nothing to undo.";
}

// === LOAD PRACTICE LINES ===
function loadRepertoire() {
    try { return JSON.parse(localStorage.getItem("chess_repertoire") || "[]"); }
    catch (e) { return []; }
}