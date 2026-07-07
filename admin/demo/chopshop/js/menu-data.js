// Single source of truth for all purchasable items.
export const MENU = [
  // Plates
  { id: 'seafood-gumbo',      name: 'Seafood Gumbo',            price: 12.50, category: 'Plates', desc: 'Shrimp, crab & andouille over rice.' },
  { id: 'shrimp-grits',       name: 'Shrimp & Grits',           price: 13.00, category: 'Plates', desc: 'Gulf shrimp, stone-ground grits, gravy.' },
  { id: 'pork-roulade',       name: 'Pork Roulade Plate',       price: 14.00, category: 'Plates', desc: 'Stuffed rolled pork loin, two sides.' },
  { id: 'jambalaya',          name: 'Jambalaya',                price: 11.00, category: 'Plates', desc: 'Chicken & sausage, Cajun rice.' },
  { id: 'red-beans-rice',     name: 'Red Beans & Rice',         price: 10.00, category: 'Plates', desc: 'Slow-cooked with smoked sausage.' },
  // Butcher Case (per lb)
  { id: 'house-boudin',       name: 'House Boudin',             price: 7.99,  category: 'Butcher Case', desc: 'Pork & rice sausage.', unit: 'lb' },
  { id: 'andouille',          name: 'Andouille',                price: 8.99,  category: 'Butcher Case', desc: 'Smoked Cajun sausage.', unit: 'lb' },
  { id: 'smoked-sausage',     name: 'Smoked Sausage',           price: 7.49,  category: 'Butcher Case', desc: 'House-smoked pork sausage.', unit: 'lb' },
  { id: 'stuffed-pork-chops', name: 'Stuffed Pork Chops',       price: 10.99, category: 'Butcher Case', desc: 'Cornbread-stuffed, thick cut.', unit: 'lb' },
  { id: 'marinated-kebabs',   name: 'Marinated Kebabs',         price: 9.99,  category: 'Butcher Case', desc: 'Beef & pepper skewers.', unit: 'lb' },
  // Sandwiches
  { id: 'roast-beef-poboy',   name: "Roast Beef Po'boy",        price: 11.50, category: 'Sandwiches', desc: 'Slow-roasted, debris gravy, dressed.' },
  { id: 'sausage-poboy',      name: "Smoked Sausage Po'boy",    price: 10.50, category: 'Sandwiches', desc: 'House sausage, dressed.' },
  { id: 'muffuletta',         name: 'Muffuletta',               price: 12.00, category: 'Sandwiches', desc: 'Olive salad, cured meats, provolone.' },
  // Sides
  { id: 'potato-salad',       name: 'Potato Salad',             price: 3.50,  category: 'Sides', desc: 'Creamy Cajun-style.' },
  { id: 'mac-cheese',         name: 'Mac & Cheese',             price: 3.50,  category: 'Sides', desc: 'Three-cheese baked.' },
  { id: 'collard-greens',     name: 'Collard Greens',           price: 3.50,  category: 'Sides', desc: 'Smoked-ham hock greens.' },
  { id: 'cornbread',          name: 'Cornbread',                price: 2.50,  category: 'Sides', desc: 'Skillet cornbread.' },
  // Drinks
  { id: 'sweet-tea',          name: 'Sweet Tea',                price: 2.50,  category: 'Drinks', desc: 'House-brewed.' },
  { id: 'lemonade',           name: 'Lemonade',                 price: 2.50,  category: 'Drinks', desc: 'Fresh-squeezed.' },
  { id: 'bottled-water',      name: 'Bottled Water',            price: 1.50,  category: 'Drinks', desc: '' },
  { id: 'boxed-coffee',       name: 'Boxed Coffee (96oz)',      price: 18.00, category: 'Drinks', desc: 'Catering size, serves ~12.' },
];

export const SPECIALS = [
  { id: 'daily-plate-lunch', name: 'Daily Plate Lunch', price: 9.99,   desc: 'Rotating plate + 2 sides + sweet tea.', when: 'Weekdays 11am–2pm' },
  { id: 'happy-hour-app',    name: 'Happy Hour Boudin Balls', price: 5.00, desc: 'Half-off app basket.', when: 'Mon–Fri 3–6pm' },
  { id: 'happy-hour-drink',  name: 'Happy Hour Draft', price: 3.00,   desc: 'Discounted draft pours.', when: 'Mon–Fri 3–6pm' },
  { id: 'deer-standard',     name: 'Deer Processing — Standard', price: 95.00, desc: 'Skin, quarter, cut, wrap & freeze (per animal).', when: 'Seasonal' },
  { id: 'deer-sausage',      name: 'Deer Processing — Sausage Add-on', price: 45.00, desc: 'Grind & season into smoked sausage (per animal).', when: 'Seasonal' },
];
