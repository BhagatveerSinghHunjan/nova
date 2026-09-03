function logGamma(value: number): number {
  const coefficients = [
    76.18009172947146, -86.50532032941608, 24.01409824083091,
    -1.231739572450155, 0.001208650973866179, -0.000005395239384953,
  ];

  const x = value;
  let y = value;
  // Lanczos approximation (Numerical Recipes): tmp = (x+5.5) - (x+0.5)*ln(x+5.5)
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;

  for (const coefficient of coefficients) {
    y += 1;
    ser += coefficient / y;
  }

  return Math.log((2.5066282746310007 * ser) / x) - tmp;
}

/**
 * Continued fraction for the incomplete beta function (modified Lentz).
 * Returns the factor such that I_x(a,b) = front * continuedFraction(a,b,x) / a
 * when used with the standard front factor.
 */
function incompleteBetaContinuedFraction(
  a: number,
  b: number,
  x: number,
): number {
  const maxIterations = 200;
  const epsilon = 3e-12;
  const fpMin = 1e-30;

  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;

  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < fpMin) {
    d = fpMin;
  }
  d = 1 / d;
  let h = d;

  for (let m = 1; m <= maxIterations; m += 1) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < fpMin) {
      d = fpMin;
    }
    c = 1 + aa / c;
    if (Math.abs(c) < fpMin) {
      c = fpMin;
    }
    d = 1 / d;
    h *= d * c;

    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < fpMin) {
      d = fpMin;
    }
    c = 1 + aa / c;
    if (Math.abs(c) < fpMin) {
      c = fpMin;
    }
    d = 1 / d;
    const delta = d * c;
    h *= delta;

    if (Math.abs(delta - 1) < epsilon) {
      break;
    }
  }

  return h;
}

/**
 * Regularized incomplete beta I_x(a, b).
 */
function regularizedIncompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) {
    return 0;
  }

  if (x >= 1) {
    return 1;
  }

  const front = Math.exp(
    logGamma(a + b) -
      logGamma(a) -
      logGamma(b) +
      a * Math.log(x) +
      b * Math.log(1 - x),
  );

  if (x < (a + 1) / (a + b + 2)) {
    return (front * incompleteBetaContinuedFraction(a, b, x)) / a;
  }

  return (
    1 - (front * incompleteBetaContinuedFraction(b, a, 1 - x)) / b
  );
}

export function studentTPValue(
  tStatistic: number,
  degreesOfFreedom: number,
): number {
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

/**
 * Upper (or signed) quantile of Student's t: returns t such that
 * P(T <= t) = probability for the central t distribution.
 *
 * For 95% two-sided CIs, call with probability = 0.975 so that
 * estimate ± studentTQuantile(0.975, df) * SE.
 *
 * Uses the two-tailed survival relation for t >= 0:
 * P(T <= t) = 1 - 0.5 * P(|T| > t).
 */
export function studentTQuantile(
  probability: number,
  degreesOfFreedom: number,
): number {
  if (degreesOfFreedom <= 0) {
    return 0;
  }

  if (probability <= 0) {
    return Number.NEGATIVE_INFINITY;
  }

  if (probability >= 1) {
    return Number.POSITIVE_INFINITY;
  }

  if (probability < 0.5) {
    return -studentTQuantile(1 - probability, degreesOfFreedom);
  }

  if (probability === 0.5) {
    return 0;
  }

  // P(|T| > t) = 2 * (1 - probability) when P(T <= t) = probability and t > 0
  const targetTwoTailedP = 2 * (1 - probability);

  let lower = 0;
  let upper = 1;

  while (studentTPValue(upper, degreesOfFreedom) > targetTwoTailedP) {
    upper *= 2;
    if (!Number.isFinite(upper) || upper > 1e8) {
      break;
    }
  }

  for (let iteration = 0; iteration < 100; iteration += 1) {
    const middle = (lower + upper) / 2;
    const twoTailedP = studentTPValue(middle, degreesOfFreedom);

    // Two-tailed p decreases as |t| increases.
    if (twoTailedP > targetTwoTailedP) {
      lower = middle;
    } else {
      upper = middle;
    }
  }

  return (lower + upper) / 2;
}
