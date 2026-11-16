/**
 * Shared interchange contract for Genba Lab and Kit of Parts.
 * Keep this file byte-for-byte compatible across both repositories.
 */
export const PRODUCT_SYSTEM_SCHEMA = 'industrialized-product-system'
export const PRODUCT_SYSTEM_VERSION = 1

export const PRODUCT_SYSTEM_CAPABILITIES = Object.freeze({
  product: 'industrialized-product-systems',
  intelligence: 'industrialized-intelligence',
  coordination: 'industrialized-coordination',
})

export function isProductSystem(value) {
  return Boolean(
    value &&
    value.schema === PRODUCT_SYSTEM_SCHEMA &&
    value.version === PRODUCT_SYSTEM_VERSION &&
    Array.isArray(value.parts),
  )
}

export function productSystemEnvelope({ id, name, parts, interfaces = [], rules = [], scenarios = [], provenance = {} }) {
  if (!id || !name || !Array.isArray(parts)) {
    throw new TypeError('A product system requires id, name, and parts.')
  }

  return {
    schema: PRODUCT_SYSTEM_SCHEMA,
    version: PRODUCT_SYSTEM_VERSION,
    id,
    name,
    capabilities: PRODUCT_SYSTEM_CAPABILITIES,
    parts,
    interfaces,
    rules,
    scenarios,
    provenance,
  }
}
