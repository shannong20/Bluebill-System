/**
 * Seed data for the AquaPure Refilling Station.
 * Values mirror the design: the same products, SKUs, staff, quotas,
 * transactions and inventory levels you see in the Figma screens.
 */
module.exports = {
  users: [
    {
      name: 'Ana Cruz',
      email: 'ana@aquapure.ph',
      password: 'password123',
      role: 'operator',
    },
    {
      name: 'Liza Mendoza',
      email: 'liza@aquapure.ph',
      password: 'password123',
      role: 'admin',
    },
  ],

  /* -------------------------------------------------------- inventory */
  inventory: [
    // Container Assets
    { name: '5-Gallon Round Container', category: 'Container Assets', stockLevel: 148, reorderPoint: 30, unitPrice: 450, unit: 'pcs', supplier: 'AquaPure Plastics' },
    { name: '5-Gallon Slim Container', category: 'Container Assets', stockLevel: 92, reorderPoint: 20, unitPrice: 420, unit: 'pcs', supplier: 'AquaPure Plastics' },
    // Equipment
    { name: 'Sediment Filter (1st Stage)', category: 'Equipment', stockLevel: 3, reorderPoint: 5, unitPrice: 180, unit: 'pcs', supplier: 'FilterPro PH' },
    { name: 'Carbon Block Filter', category: 'Equipment', stockLevel: 8, reorderPoint: 5, unitPrice: 220, unit: 'pcs', supplier: 'FilterPro PH' },
    { name: 'Membrane RO Filter', category: 'Equipment', stockLevel: 2, reorderPoint: 3, unitPrice: 650, unit: 'pcs', supplier: 'FilterPro PH' },
    { name: 'UV Lamp Bulb', category: 'Equipment', stockLevel: 4, reorderPoint: 4, unitPrice: 290, unit: 'pcs', supplier: 'PureTech Supply' },
    // Raw Supplies — retail prices above the unit cost. Everything seeded is
    // sellable at the POS unless `isSellable: false` says otherwise.
    { name: 'Bottle Caps (Pcs)', category: 'Raw Supplies', stockLevel: 120, reorderPoint: 200, unitPrice: 0.5, unit: 'pcs', supplier: 'PackRight Inc.', sellPrice: 2, icon: 'box' },
    { name: 'Alkaline Mineral Balls', category: 'Raw Supplies', stockLevel: 45, reorderPoint: 20, unitPrice: 85, unit: 'pcs', supplier: 'PureTech Supply', sellPrice: 150, icon: 'box' },
    { name: 'Sealing Rings / O-Rings', category: 'Raw Supplies', stockLevel: 312, reorderPoint: 100, unitPrice: 2.5, unit: 'pcs', supplier: 'PackRight Inc.', sellPrice: 10, icon: 'box' },
    { name: 'Shrink Wrap (Roll)', category: 'Raw Supplies', stockLevel: 18, reorderPoint: 10, unitPrice: 35, unit: 'roll', supplier: 'PackRight Inc.', sellPrice: 80, icon: 'box' },
    // Finished Stock — the stock *behind* the Refills/Packages products. Left
    // off the supplies grid on purpose: these are already sold through the
    // refill products, which draw down this very level.
    { name: 'Purified Water (5-Gallon)', category: 'Finished Stock', stockLevel: 640, reorderPoint: 120, unitPrice: 50, unit: 'gallon', isSellable: false },
    { name: 'Refillable Container Stock', category: 'Finished Stock', stockLevel: 240, reorderPoint: 50, unitPrice: 450, unit: 'pcs', isSellable: false },
  ],

  /* ---------------------------------------------------------- products */
  products: [
    { name: '5-Gal Round Refill', category: 'refill', price: 25, icon: 'droplet', gallons: 1, yieldsContainer: true, containerSize: '5-Gallon Round', inventoryKey: 'Purified Water (5-Gallon)' },
    { name: '5-Gal Slim Refill', category: 'refill', price: 25, icon: 'droplet', gallons: 1, yieldsContainer: true, containerSize: '5-Gallon Slim', inventoryKey: 'Purified Water (5-Gallon)' },
    { name: '1L Bottle Pack (6s)', category: 'package', price: 80, icon: 'box', gallons: 0.4, inventoryKey: 'Purified Water (5-Gallon)' },
    { name: 'New Container + Water', category: 'package', price: 470, icon: 'container', gallons: 1, yieldsContainer: true, containerSize: '5-Gallon Round', inventoryKey: 'Refillable Container Stock' },
    { name: 'Slim New Container + Water', category: 'package', price: 445, icon: 'container', gallons: 1, yieldsContainer: true, containerSize: '5-Gallon Slim', inventoryKey: 'Refillable Container Stock' },
    { name: 'LPG Tank Refill (11kg)', category: 'refill', price: 680, icon: 'tank', gallons: 0, inventoryKey: null },
    { name: 'Purified Water Pouch 500mL', category: 'supply', price: 5, icon: 'pouch', gallons: 0.06, inventoryKey: 'Purified Water (5-Gallon)' },
  ],

  /* -------------------------------------------------------- employees */
  employees: [
    { name: 'Maria Santos', role: 'clerk', quotaTarget: 60, commissionRate: 5, shift: 'Morning' },
    { name: 'John Reyes', role: 'driver', quotaTarget: 50, commissionRate: 5, shift: 'Morning' },
    { name: 'Ana Cruz', role: 'clerk', quotaTarget: 60, commissionRate: 5, shift: 'Morning' },
    { name: 'Ben Torres', role: 'driver', quotaTarget: 50, commissionRate: 5, shift: 'Morning' },
    { name: 'Liza Mendoza', role: 'operator', quotaTarget: 80, commissionRate: 5, shift: 'Morning' },
    { name: 'Carlo Diaz', role: 'driver', quotaTarget: 50, commissionRate: 5, shift: 'Morning' },
  ],

  /* --------------------------------------------------------- customers */
  customers: [
    { name: 'Rosario Dela Cruz', type: 'regular', phone: '0917 555 0142', address: '123 Mabini St, Barangay Hall', creditLimit: 5000 },
    { name: 'Barangay Hall', type: 'delivery', phone: '0918 555 0198', address: 'Barangay Hall, Main St', creditLimit: 10000 },
    { name: 'Pedro Santiago', type: 'regular', phone: '0919 555 0110', address: '45 Rizal Ave', creditLimit: 3000 },
    { name: 'Marites Aquino', type: 'regular', phone: '0920 555 0177', address: '78 Bonifacio St', creditLimit: 2000 },
    { name: 'Jonalyn Perez', type: 'delivery', phone: '0921 555 0133', address: '12 Del Pilar St', creditLimit: 4000 },
  ],

  /* --------------------------------------------------------- container mix */
  containerMix: { inStation: 173, withCustomer: 67, damaged: 8, sizes: { round: 148, slim: 92, other: 8 } },
};
