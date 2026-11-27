const Product = require('../models/Product');
const ApiError = require('../utils/ApiError');
const { PRODUCT_CATEGORIES, PRODUCT_CATEGORY_LABELS } = require('../config/constants');

const escapeRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function buildFilter({ category, search, isActive } = {}) {
  const filter = {};
  if (category) filter.category = category;
  if (isActive !== undefined) filter.isActive = isActive;
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ name: rx }, { sku: rx }, { description: rx }];
  }
  return filter;
}

/** Products for the POS grid, grouped by category. */
async function list(query) {
  const products = await Product.find(buildFilter(query))
    .sort({ category: 1, name: 1 })
    .populate('inventoryItem', 'stockLevel reorderPoint status')
    .lean();

  return {
    items: products,
    categories: PRODUCT_CATEGORIES.map((key) => ({
      key,
      label: PRODUCT_CATEGORY_LABELS[key],
      count: products.filter((p) => p.category === key).length,
    })),
  };
}

async function getById(id) {
  const product = await Product.findById(id).lean();
  if (!product) throw ApiError.notFound('Product not found');
  return product;
}

async function create(payload) {
  if (payload.sku && (await Product.exists({ sku: payload.sku.toUpperCase() }))) {
    throw ApiError.conflict(`A product with SKU ${payload.sku} already exists`);
  }
  const product = new Product(payload);
  await product.save();
  return product;
}

async function update(id, payload) {
  const product = await Product.findById(id);
  if (!product) throw ApiError.notFound('Product not found');
  Object.assign(product, payload);
  await product.save();
  return product;
}

async function remove(id) {
  const product = await Product.findByIdAndDelete(id);
  if (!product) throw ApiError.notFound('Product not found');
  return { id };
}

module.exports = { list, getById, create, update, remove, buildFilter };
