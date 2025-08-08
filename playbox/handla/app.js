// State
const STORAGE_KEY = "handla:items";
const SORT_KEY = "handla:sort";

/** @typedef {{ id: string; name: string; quantity: number | null; category: string; categoryMode: 'auto' | 'manual'; createdAt: number; updatedAt: number; }} GroceryItem */

/** @type {GroceryItem[]} */
let items = [];

// Elements
const addForm = document.getElementById("addForm");
const nameInput = document.getElementById("nameInput");
const qtyInput = document.getElementById("qtyInput");
const itemsList = document.getElementById("itemsList");
const itemTemplate = /** @type {HTMLTemplateElement} */ (document.getElementById("itemTemplate"));
const sortSelect = document.getElementById("sortSelect");
const searchInput = document.getElementById("searchInput");
const clearAllBtn = document.getElementById("clearAllBtn");

// Categories and rules
const ALL_CATEGORIES = [
  "Dairy","Bakery","Produce","Meat","Seafood","Pantry","Frozen","Beverages","Snacks","Household","Personal Care","Deli","Eggs","Other"
];

/** @type {{ category: string; keywords: string[]; }[]} */
const CATEGORY_RULES = [
  { category: "Dairy", keywords: ["milk","yogurt","butter","cheese","cream","kefir","cottage","gouda","mozzarella"] },
  { category: "Eggs", keywords: ["egg","eggs"] },
  { category: "Bakery", keywords: ["bread","baguette","bagel","bun","roll","tortilla","pita","loaf","croissant","brioche","naan"] },
  { category: "Produce", keywords: ["apple","banana","lettuce","tomato","onion","garlic","carrot","spinach","kale","avocado","pepper","cucumber","grape","lemon","lime","berry","berries","broccoli","cauliflower","zucchini","mushroom","potato","sweet potato","herb","cilantro","parsley","basil"] },
  { category: "Meat", keywords: ["chicken","beef","pork","turkey","lamb","sausage","ham","bacon","steak","ground beef","ground turkey"] },
  { category: "Seafood", keywords: ["salmon","tuna","shrimp","fish","cod","tilapia","sardine"] },
  { category: "Pantry", keywords: ["rice","pasta","flour","sugar","salt","pepper","oil","olive oil","vinegar","spice","beans","lentil","cereal","oat","oats","sauce","tomato sauce","canned","can ","broth","stock","yeast","baking","bake","honey","peanut butter"] },
  { category: "Frozen", keywords: ["frozen","ice cream","peas","fries","pizza","nugget","nuggets","spinach frozen","berries frozen","gelato"] },
  { category: "Beverages", keywords: ["juice","soda","coffee","tea","water","beer","wine","sparkling","kombucha"] },
  { category: "Snacks", keywords: ["chips","cookies","cracker","crackers","nuts","popcorn","candy","chocolate","granola bar"] },
  { category: "Household", keywords: ["paper towel","toilet paper","detergent","soap","dish","cleaner","foil","wrap","bag","trash","bleach"] },
  { category: "Personal Care", keywords: ["shampoo","toothpaste","toothbrush","razor","deodorant","lotion","conditioner","body wash"] },
  { category: "Deli", keywords: ["deli","sandwich","cold cuts","salami","prosciutto","mortadella"] },
];

function normalize(text) {
  return text.toLowerCase().normalize("NFKD").replace(/\p{Diacritic}/gu, "");
}

function detectCategoryAuto(name) {
  const n = normalize(name);
  // Some quick special rules first
  if (/\b(ice\s?cream|gelato)\b/.test(n)) return "Frozen";
  if (/\b(egg|eggs)\b/.test(n)) return "Eggs";

  for (const rule of CATEGORY_RULES) {
    for (const keyword of rule.keywords) {
      if (n.includes(keyword)) {
        return rule.category;
      }
    }
  }
  return "Other";
}

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36).slice(2);
}

function loadItems() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch { return []; }
}

function saveItems() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function loadSort() {
  const v = localStorage.getItem(SORT_KEY);
  if (v === "name" || v === "category" || v === "recent") return v;
  return "recent";
}

function saveSort(value) {
  localStorage.setItem(SORT_KEY, value);
}

function sortItems(list) {
  const mode = sortSelect.value;
  const copy = [...list];
  if (mode === "name") {
    copy.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  } else if (mode === "category") {
    copy.sort((a, b) => a.category.localeCompare(b.category, undefined, { sensitivity: "base" }) || a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  } else {
    copy.sort((a, b) => b.createdAt - a.createdAt);
  }
  return copy;
}

function filterItems(list, query) {
  const q = normalize(query.trim());
  if (!q) return list;
  return list.filter(item => {
    const hay = normalize(`${item.name} ${item.category}`);
    return hay.includes(q);
  });
}

function render() {
  itemsList.innerHTML = "";
  const filtered = filterItems(items, searchInput.value || "");
  const sorted = sortItems(filtered);
  for (const item of sorted) {
    const node = /** @type {HTMLElement} */ (itemTemplate.content.firstElementChild.cloneNode(true));
    node.dataset.id = item.id;
    const chip = node.querySelector(".category-chip");
    chip.textContent = item.category;
    chip.setAttribute("data-category", item.category);

    const nameEl = node.querySelector(".item-name");
    nameEl.textContent = item.name;
    const qtyEl = node.querySelector(".item-qty");
    qtyEl.textContent = item.quantity ? `Qty: ${item.quantity}` : "";

    const editBtn = node.querySelector(".edit");
    const delBtn = node.querySelector(".delete");
    const editPanel = node.querySelector(".item-edit");
    const editName = node.querySelector(".edit-name");
    const editQty = node.querySelector(".edit-qty");
    const editCat = node.querySelector(".edit-category");
    const saveBtn = node.querySelector(".save");
    const cancelBtn = node.querySelector(".cancel");

    // Prefill edit fields
    editName.value = item.name;
    editQty.value = item.quantity ?? "";
    if (item.categoryMode === "auto") {
      editCat.value = "__auto__";
    } else {
      if (!ALL_CATEGORIES.includes(item.category)) {
        editCat.value = "Other";
      } else {
        editCat.value = item.category;
      }
    }

    editBtn.addEventListener("click", () => {
      editPanel.hidden = !editPanel.hidden;
    });

    cancelBtn.addEventListener("click", () => {
      editPanel.hidden = true;
      editName.value = item.name;
      editQty.value = item.quantity ?? "";
      editCat.value = item.categoryMode === "auto" ? "__auto__" : (ALL_CATEGORIES.includes(item.category) ? item.category : "Other");
    });

    delBtn.addEventListener("click", () => {
      items = items.filter(x => x.id !== item.id);
      saveItems();
      render();
    });

    saveBtn.addEventListener("click", () => {
      const newName = editName.value.trim();
      const qtyValue = editQty.value !== "" ? Number(editQty.value) : null;
      const catSel = editCat.value;

      if (!newName) {
        alert("Name is required");
        return;
      }

      item.name = newName;
      item.quantity = qtyValue && qtyValue > 0 ? qtyValue : null;
      if (catSel === "__auto__") {
        item.categoryMode = "auto";
        item.category = detectCategoryAuto(newName);
      } else {
        item.categoryMode = "manual";
        item.category = ALL_CATEGORIES.includes(catSel) ? catSel : "Other";
      }
      item.updatedAt = Date.now();
      saveItems();
      render();
    });

    itemsList.appendChild(node);
  }
}

addForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = nameInput.value.trim();
  const qty = qtyInput.value !== "" ? Number(qtyInput.value) : null;
  if (!name) return;

  /** @type {GroceryItem} */
  const item = {
    id: uid(),
    name,
    quantity: qty && qty > 0 ? qty : null,
    categoryMode: "auto",
    category: detectCategoryAuto(name),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  items.unshift(item);
  saveItems();
  addForm.reset();
  nameInput.focus();
  render();
});

sortSelect.addEventListener("change", () => {
  saveSort(sortSelect.value);
  render();
});

searchInput.addEventListener("input", () => {
  render();
});

clearAllBtn.addEventListener("click", () => {
  if (items.length === 0) return;
  if (confirm("Clear all items?")) {
    items = [];
    saveItems();
    render();
  }
});

// Init
items = loadItems();
sortSelect.value = loadSort();
render();