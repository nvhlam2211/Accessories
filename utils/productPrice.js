function effectivePrice(product) {
  const price = Number(product.price);
  const discountPercent = Number(product.discountPercent ?? 0);
  return discountPercent > 0 && discountPercent < 100
    ? Number((price * (1 - discountPercent / 100)).toFixed(2))
    : price;
}

module.exports = { effectivePrice };
