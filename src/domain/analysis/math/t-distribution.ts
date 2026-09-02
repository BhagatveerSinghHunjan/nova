function logGamma(value: number): number {
  const coefficients = [
    76.18009172947146, -86.50532032941608, 24.01409824083091,
    -1.231739572450155, 0.001208650973866179, -0.000005395239384953,
  ];

  const x = value;
  let y = value;
  let tmp = x + 5.5;
  tmp -= x + 0.5;
  let ser = 1.000000000190015;

  for (const coefficient of coefficients) {
    y += 1;
    ser += coefficient / y;
  }

  return Math.log(2.5066282746310007 * ser / x) - tmp;
}

function regularizedIncompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) {
    return 0;
  }

  if (x >= 1) {
    return 1;
  }

  const beta =
    Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));

  const useContinuedFraction = x > (a + 1) / (a + b + 2);

  if (useContinuedFraction) {
    return 1 - regularizedIncompleteBeta(1 - x, b, a);
  }

  let numerator = 1;
  let denominator = 1 - (a + b) * x / (a + 1);

  if (Math.abs(denominator) < 1e-30) {
    denominator = 1e-30;
  }

  let result = 1 / denominator;

  for (let index = 1; index <= 200; index += 1) {
    const even = index * 2;
    let aa = (index * (b - index) * x) / ((a + even - 1) * (a + even));
    denominator = 1 + aa * denominator;
    if (Math.abs(denominator) < 1e-30) {
      denominator = 1e-30;
    }
    numerator = 1 + aa / numerator;
    if (Math.abs(numerator) < 1e-30) {
      numerator = 1e-30;
    }
    result *= numerator / denominator;

    aa = -((a + index) * (a + b + index) * x) / ((a + even) * (a + even + 1));
    denominator = 1 + aa * denominator;
    if (Math.abs(denominator) < 1e-30) {
      denominator = 1e-30;
    }
    numerator = 1 + aa / numerator;
    if (Math.abs(numerator) < 1e-30) {
      numerator = 1e-30;
    }
    const delta = numerator / denominator;
    result *= delta;

    if (Math.abs(delta - 1) < 1e-10) {
      break;
    }
  }

  return (result * beta) / a;
}

export function studentTPValue(tStatistic: number, degreesOfFreedom: number): number {
  if (!Number.isFinite(tStatistic)) {
    return 1;
  }

  if (degreesOfFreedom <= 0) {
    return 1;
  }

  const tSquared = tStatistic * tStatistic;
  const x = degreesOfFreedom / (degreesOfFreedom + tSquared);
  const p = regularizedIncompleteBeta(x, degreesOfFreedom / 2, 0.5);
  return Math.min(1, Math.max(0, p));
}

export function studentTQuantile(
  probability: number,
  degreesOfFreedom: number,
): number {
  if (degreesOfFreedom <= 0) {
    return 0;
  }

  let lower = 0;
  let upper = 100;

  while (studentTPValue(upper, degreesOfFreedom) > 1 - probability) {
    upper *= 2;
  }

  for (let iteration = 0; iteration < 100; iteration += 1) {
    const middle = (lower + upper) / 2;
    const survival = 1 - studentTPValue(middle, degreesOfFreedom);

    if (survival > probability) {
      lower = middle;
    } else {
      upper = middle;
    }
  }

  return (lower + upper) / 2;
}
