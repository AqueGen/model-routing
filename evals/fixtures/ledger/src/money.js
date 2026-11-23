export function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function sumMoney(values) {
  return roundMoney(values.reduce((acc, v) => acc + v, 0));
}

export function formatMoney(value) {
  return roundMoney(value).toFixed(2);
}
