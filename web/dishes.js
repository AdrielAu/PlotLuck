// The voxel kitchen's roster: nine appliances and the dishes each sends to the table.
// Pure: no DOM or Three.js, so it runs in Node tests. Decorative only (#135).

export const APPLIANCES = ["pizza oven", "oven", "fryer", "hob", "grill", "tandoor", "steamer", "wok", "fridge"];

// shape picks the voxel model in kitchen.js; colours run from base to topping.
const dish = (name, cuisine, appliance, shape, ...colours) => ({ name, cuisine, appliance, shape, colours });
export const DISHES = [
  dish("Margherita", "Italian", "pizza oven", "flat", 0xe2b26a, 0xc8372d, 0xf4ecd8, 0x3f8f3a),
  dish("Lahmacun", "Turkish", "pizza oven", "flat", 0xdba86a, 0xa8432c, 0x5e8f3a, 0xf0e6c8),
  dish("Croissant", "French", "oven", "pile", 0xd99a3e, 0xb87425, 0xf0c46c),
  dish("Lasagne", "Italian", "oven", "slab", 0xe8c26a, 0xb5402c, 0xf2e2b0),
  dish("Roast dinner", "British", "oven", "pile", 0x8a4b2a, 0xd9a441, 0x4f8a35, 0xe9dcc0),
  dish("Moussaka", "Greek", "oven", "slab", 0x6b3a5a, 0xc4602f, 0xf1e0b0),
  dish("Fish and chips", "British", "fryer", "pile", 0xe0a845, 0xf3d27a, 0x77b04a),
  dish("Tempura", "Japanese", "fryer", "pile", 0xf0cf7c, 0xe7b860, 0xf26b4a),
  dish("Churros", "Spanish", "fryer", "skewer", 0xc98a3c, 0xe8b45e, 0x5a3220),
  dish("Fried chicken", "American", "fryer", "pile", 0xb9682a, 0xd98e3f, 0xe9b866),
  dish("Onion bhaji", "Indian", "fryer", "pile", 0xb86f24, 0xd7953a, 0x6c9a3a),
  dish("Full English", "British", "hob", "flat", 0xf7f2e4, 0xf2c230, 0xa8402e, 0x7b4a2a),
  dish("Paella", "Spanish", "hob", "flat", 0xf0b92e, 0xe36f3a, 0x4f8a35, 0xf6e7b8),
  dish("Green curry", "Thai", "hob", "bowl", 0x9ab74a, 0xf2ecd6, 0xe0d48a),
  dish("Ramen", "Japanese", "hob", "bowl", 0xd9a85a, 0xf4e1a0, 0x4f8a35, 0xb05b3b),
  dish("Carbonara", "Italian", "hob", "bowl", 0xf1d58a, 0xf6e7b8, 0x8a4b2a),
  dish("Doner kebab", "Turkish", "grill", "stack", 0xe5c48a, 0x9a5532, 0x5e9a3a, 0xf3efe0),
  dish("Burger", "American", "grill", "stack", 0xd9973c, 0x6b3a22, 0x5e9a3a, 0xd9973c),
  dish("Satay", "Malaysian", "grill", "skewer", 0xb06a2c, 0xd08c3a, 0xe4c07a),
  dish("Korean BBQ", "Korean", "grill", "flat", 0x8a3a28, 0xc2563a, 0x4f8a35, 0xf3efe0),
  dish("Souvlaki", "Greek", "grill", "skewer", 0xa8642e, 0xe8d8b0, 0x6c9a3a),
  dish("Chicken tikka with naan", "Indian", "tandoor", "flat", 0xe8c88a, 0xd5512a, 0xf5ead0, 0x4f8a35),
  dish("Seekh kebab", "Indian", "tandoor", "skewer", 0x8a4426, 0xb5652e, 0x6c9a3a),
  dish("Dim sum", "Chinese", "steamer", "pile", 0xf3ead6, 0xe9dcc0, 0xe08aa0),
  dish("Bao buns", "Taiwanese", "steamer", "stack", 0xf5efe0, 0x8a4b2a, 0x5e9a3a, 0xf5efe0),
  dish("Stir-fry", "Chinese", "wok", "bowl", 0x2f2f2f, 0xe9a23a, 0x5e9a3a, 0xc8372d),
  dish("Pad thai", "Thai", "wok", "bowl", 0x2f2f2f, 0xf0c46c, 0xe36f3a, 0x5e9a3a),
  dish("Char siu fried rice", "Chinese", "wok", "bowl", 0x2f2f2f, 0xf3e3a8, 0xb5402c, 0x5e9a3a),
  dish("Sushi", "Japanese", "fridge", "pile", 0x1f3a2a, 0xf6f1e4, 0xf07a5a),
  dish("Ceviche", "Peruvian", "fridge", "bowl", 0xf2ecd6, 0xf5e8c4, 0xd94a3a, 0x5e9a3a),
  dish("Tiramisu", "Italian", "fridge", "slab", 0x6b4226, 0xf3e6c4, 0x8a5a3a),
];

// A dish not yet served whose appliance did not fire last, or null when none is left.
export function nextDish(served, random) {
  const last = served.at(-1)?.appliance;
  const left = DISHES.filter((d) => !served.includes(d) && d.appliance !== last);
  return left.length ? left[Math.floor(random() * left.length)] : null;
}
