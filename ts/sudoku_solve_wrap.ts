
importScripts('/sudoku_solve.js');

interface Msg_grid {
    idx: number;
    grid: string;
}

// external functions
declare function sudokuSolve(s: string): string;
declare function validateSudoku(s:string): boolean;

onmessage = (_msg) => {
    let msg = <Msg_grid> _msg.data;
    console.log(`worker: solve msg idx=${ msg.idx }, grid = ${msg.grid}`);

    let sol = sudokuSolve(msg.grid);
    console.log(`worker: solution for idx=${ msg.idx } is ${sol}`);
    postMessage({idx: msg.idx, grid: sol});
}
