export type Matrix = number[][];

export type Vector = number[];

export function transpose(matrix: Matrix): Matrix {
  if (matrix.length === 0) {
    return [];
  }

  return matrix[0].map((_, columnIndex) =>
    matrix.map((row) => row[columnIndex]),
  );
}

export function multiply(a: Matrix, b: Matrix): Matrix {
  const rows = a.length;
  const columns = b[0]?.length ?? 0;
  const inner = b.length;
  const result = Array.from({ length: rows }, () =>
    Array.from({ length: columns }, () => 0),
  );

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      let sum = 0;
      for (let index = 0; index < inner; index += 1) {
        sum += a[row][index] * b[index][column];
      }
      result[row][column] = sum;
    }
  }

  return result;
}

export function multiplyVector(matrix: Matrix, vector: Vector): Vector {
  return matrix.map((row) =>
    row.reduce((sum, value, index) => sum + value * vector[index], 0),
  );
}

export function identity(size: number): Matrix {
  return Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, column) => (row === column ? 1 : 0)),
  );
}

export function invert(matrix: Matrix): Matrix {
  const size = matrix.length;
  const augmented = matrix.map((row, rowIndex) => [
    ...row,
    ...identity(size)[rowIndex],
  ]);

  for (let pivot = 0; pivot < size; pivot += 1) {
    let maxRow = pivot;
    for (let row = pivot + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][pivot]) > Math.abs(augmented[maxRow][pivot])) {
        maxRow = row;
      }
    }

    if (Math.abs(augmented[maxRow][pivot]) < 1e-12) {
      throw new Error("Matrix is singular and cannot be inverted");
    }

    if (maxRow !== pivot) {
      [augmented[pivot], augmented[maxRow]] = [augmented[maxRow], augmented[pivot]];
    }

    const pivotValue = augmented[pivot][pivot];
    for (let column = 0; column < augmented[pivot].length; column += 1) {
      augmented[pivot][column] /= pivotValue;
    }

    for (let row = 0; row < size; row += 1) {
      if (row === pivot) {
        continue;
      }

      const factor = augmented[row][pivot];
      for (let column = 0; column < augmented[row].length; column += 1) {
        augmented[row][column] -= factor * augmented[pivot][column];
      }
    }
  }

  return augmented.map((row) => row.slice(size));
}

export function dot(a: Vector, b: Vector): number {
  return a.reduce((sum, value, index) => sum + value * b[index], 0);
}

export function subtract(a: Vector, b: Vector): Vector {
  return a.map((value, index) => value - b[index]);
}

export function sumSquares(values: Vector): number {
  return values.reduce((sum, value) => sum + value * value, 0);
}
