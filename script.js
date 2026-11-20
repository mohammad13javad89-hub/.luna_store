// ========================================
// تنظیمات و اطلاعات محصولات فروشگاه LUNA
// ========================================

const PRODUCTS_KEY = "lunaProducts";
const CART_KEY = "lunaCart";

const defaultProducts = [
    {
        id: "1",
        name: "مانتو تابستانی",
        price: 850000,
        category: "manteau",
        stock: 10,
        image: "assets/manteau.svg",
        description: "مانتو مناسب استفاده روزمره"
    },
    {
        id: "2",
        name: "لباس مجلسی",
        price: 1500000,
        category: "formal",
        stock: 5,
        image: "assets/formal.svg",
        description: "لباس مناسب مهمانی"
    },
    {
        id: "3",
        name: "ست لباس روزمره",
        price: 650000,
        category: "casual",
        stock: 8,
        image: "assets/casual.svg",
        description: "ست لباس مناسب استفاده روزمره"
    },
    {
        id: "4",
        name: "ست لباس اسپرت",
        price: 950000,
        category: "sport",
        stock: 6,
        image: "assets/sport.svg",
        description: "ست لباس اسپرت"
    }
];

const categoryNames = {
    manteau: "مانتو",
    formal: "لباس مجلسی",
    casual: "لباس روزمره",
    sport: "لباس اسپرت"
};


// ========================================
// دریافت محصولات
// ========================================

async function loadProductsFromServer() {
    if (productList) {
        productList.textContent = "در حال دریافت محصولات...";
    }

    try {
        const response = await fetch("/api/products", { cache: "no-store" });

        if (!response.ok) {
            throw new Error("خطا در دریافت محصولات");
        }

        const data = await response.json();

        if (!Array.isArray(data)) {
            throw new Error("اطلاعات محصولات معتبر نیست");
        }

        products = data.map(product => ({
            ...product,
            id: String(product.id),
            price: Number(product.price),
            stock: Number(product.stock)
        }));

        renderProducts();
        updateCart();

    } catch (error) {
        console.error("خطا در دریافت محصولات:", error);

        if (productList) {
            productList.textContent =
                "دریافت محصولات با مشکل مواجه شد.";
        }
    }
}

let products = [];



// ========================================
// دریافت عناصر صفحه
// ========================================

const productList = document.querySelector(".product-list");

const productSearch = document.getElementById("productSearch");
const categoryFilter = document.getElementById("categoryFilter");
const priceSort = document.getElementById("priceSort");

const cartButton = document.getElementById("cartButton");
const cartPanel = document.getElementById("cartPanel");
const closeCart = document.getElementById("closeCart");

const cartCount = document.getElementById("cartCount");
const cartItems = document.getElementById("cartItems");
const cartTotal = document.getElementById("cartTotal");

const checkoutButton = document.getElementById("checkoutButton");


// ========================================
// ذخیره سبد خرید
// ========================================

function loadCart() {
    try {
        const saved = JSON.parse(
            localStorage.getItem(CART_KEY) || "[]"
        );

        if (!Array.isArray(saved)) {
            return [];
        }

        return saved.filter(item =>
            item &&
            typeof item.name === "string" &&
            Number.isFinite(Number(item.price)) &&
            Number.isFinite(Number(item.quantity)) &&
            Number(item.quantity) > 0
        ).map(item => ({
            ...item,
            price: Number(item.price),
            quantity: Math.floor(Number(item.quantity))
        }));

    } catch {
        return [];
    }
}

let cart = loadCart();

let cartHasIssues = false;

function saveCart() {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
}


// ========================================
// تبدیل قیمت به شکل فارسی
// ========================================

function formatPrice(price) {
    return Number(price).toLocaleString("fa-IR") + " تومان";
}


// ========================================
// نمایش محصولات در فروشگاه
// ========================================

function renderProducts() {
    if (!productList) return;

    const searchText = productSearch
        ? productSearch.value.trim().toLowerCase()
        : "";

    const selectedCategory = categoryFilter
        ? categoryFilter.value
        : "all";

    const sortValue = priceSort
        ? priceSort.value
        : "default";

    let filteredProducts = products.filter(product => {
        const matchesName = product.name
            .toLowerCase()
            .includes(searchText);

        const matchesCategory =
            selectedCategory === "all" ||
            product.category === selectedCategory;

        return matchesName && matchesCategory;
    });

    if (sortValue === "low") {
        filteredProducts.sort(
            (a, b) => Number(a.price) - Number(b.price)
        );
    }

    if (sortValue === "high") {
        filteredProducts.sort(
            (a, b) => Number(b.price) - Number(a.price)
        );
    }

    productList.replaceChildren();

    if (filteredProducts.length === 0) {
        const emptyMessage = document.createElement("p");

        emptyMessage.textContent =
            "محصولی با این مشخصات پیدا نشد.";

        emptyMessage.className = "products-description";

        productList.appendChild(emptyMessage);

        return;
    }

    filteredProducts.forEach(product => {
        const card = document.createElement("div");

        card.className = "product-card";
        card.dataset.category = product.category;
        card.dataset.productId = product.id;

        // رفتن به صفحه اختصاصی محصول با کلیک روی کارت
        card.style.cursor = "pointer";

        card.addEventListener("click", (event) => {
            // اگر روی دکمه خرید کلیک شده، صفحه عوض نشود
            if (event.target.closest("button")) {
                return;
            }

            window.location.href =
                `product.html?id=${encodeURIComponent(product.id)}`;
        });



        // تصویر محصول
        const image = document.createElement("img");

        image.src = product.image || "";
        image.alt = product.name;
        image.loading = "lazy";

        if (!product.image) {
            image.hidden = true;
        }

        image.addEventListener("error", () => {
            image.hidden = true;
        });

        // اطلاعات محصول
        const info = document.createElement("div");

        info.className = "product-info";

        const name = document.createElement("h3");

        name.textContent = product.name;

        const price = document.createElement("p");

        price.textContent = formatPrice(product.price);

        const description = document.createElement("p");

        description.textContent = product.description || "";

        // موجودی
        const stock = document.createElement("p");

        if (Number(product.stock) > 0) {
            stock.textContent =
                "موجودی: " +
                Number(product.stock).toLocaleString("fa-IR");
        } else {
            stock.textContent = "ناموجود";
        }

        // دکمه افزودن به سبد خرید
        const button = document.createElement("button");

        button.type = "button";

        if (Number(product.stock) > 0) {
            button.textContent = "افزودن به سبد خرید";
        } else {
            button.textContent = "ناموجود";
            button.disabled = true;
        }

        button.addEventListener("click", () => {
            addToCart(product.id);
        });

        info.append(name, price);

        if (product.description) {
            info.appendChild(description);
        }

        info.append(stock, button);

        card.append(image, info);

        productList.appendChild(card);
    });
}


// ========================================
// افزودن محصول به سبد خرید
// ========================================

function addToCart(productId) {
    const product = products.find(
        item => String(item.id) === String(productId)
    );

    if (!product) {
        alert("محصول پیدا نشد.");
        return;
    }

    const existing = cart.find(
        item => String(item.id) === String(product.id)
    );

    const quantityInCart = existing
        ? existing.quantity
        : 0;

    if (quantityInCart >= Number(product.stock)) {
        alert("تعداد درخواستی از موجودی محصول بیشتر است.");
        return;
    }

    if (existing) {
        existing.quantity++;
    } else {
        cart.push({
            id: product.id,
            name: product.name,
            price: Number(product.price),
            quantity: 1
        });
    }

    updateCart();

    alert("محصول به سبد خرید اضافه شد!");
}


// ========================================
// نمایش سبد خرید
// ========================================

function updateCart() {
    if (!cartItems) return;

    let count = 0;
    let total = 0;

    cartHasIssues = false;

    cartItems.replaceChildren();

    cart.forEach((item, index) => {

        const currentProduct = products.find(
            product => String(product.id) === String(item.id)
        );

        let issueMessage = "";

        if (currentProduct) {

            item.name = currentProduct.name;
            item.price = Number(currentProduct.price) || 0;

            if (item.quantity > Number(currentProduct.stock)) {
                cartHasIssues = true;
                issueMessage = "موجودی این محصول کافی نیست.";
            }

            total += item.price * item.quantity;

        } else {

            cartHasIssues = true;
            issueMessage = "این محصول دیگر در فروشگاه موجود نیست."

        }

        count += item.quantity;

        const row = document.createElement("div");

        row.className = "cart-item";

        const info = document.createElement("div");

        const title = document.createElement("h3");

        title.textContent = item.name;

        const price = document.createElement("p");

        price.textContent = formatPrice(item.price);

        const warning = document.createElement("p");

        warning.textContent = issueMessage;

        warning.style.color = "#ff5555";

        warning.style.fontSize = "13px";

        // کنترل تعداد
        const controls = document.createElement("div");

        controls.className = "quantity-controls";

        const minus = document.createElement("button");

        minus.type = "button";
        minus.textContent = "−";

        const quantity = document.createElement("span");

        quantity.textContent =
            item.quantity.toLocaleString("fa-IR");

        const plus = document.createElement("button");

        plus.type = "button";
        plus.textContent = "+";

        minus.addEventListener("click", () => {
            if (item.quantity > 1) {
                item.quantity--;
            } else {
                cart.splice(index, 1);
            }

            updateCart();
        });

        plus.addEventListener("click", () => {
            const product = products.find(
                p => String(p.id) === String(item.id)
            );

            if (
                product &&
                item.quantity < Number(product.stock)
            ) {
                item.quantity++;
                updateCart();
            } else {
                alert("موجودی کافی نیست.");
            }
        });

        controls.append(minus, quantity, plus);

        // حذف محصول
        const remove = document.createElement("button");

        remove.type = "button";
        remove.className = "remove-item";
        remove.textContent = "حذف";

        remove.addEventListener("click", () => {
            cart.splice(index, 1);

            updateCart();
        });

        info.append(title, price, warning, controls);

        row.append(info, remove);

        cartItems.appendChild(row);
    });

    if (cart.length === 0) {
        cartItems.textContent = "سبد خرید شما خالی است.";
    }

    if (cartCount) {
        cartCount.textContent = count.toLocaleString("fa-IR");
    }

    if (cartTotal) {
        cartTotal.textContent = total.toLocaleString("fa-IR");
    }

    saveCart();
}


// ========================================
// باز و بسته کردن سبد خرید
// ========================================

if (cartButton && cartPanel) {
    cartButton.addEventListener("click", () => {
        cartPanel.classList.add("open");
    });
}

if (closeCart && cartPanel) {
    closeCart.addEventListener("click", () => {
        cartPanel.classList.remove("open");
    });
}


// ========================================
// ادامه خرید
// ========================================

if (checkoutButton) {
    checkoutButton.addEventListener("click", () => {

        if (cart.length === 0) {
            alert("سبد خرید شما خالی است!");
            return;
        }

        if (cartHasIssues) {
            alert("لطفاً ابتدا مشکلات سبد خرید را برطرف کنید.");
            return;
        }

        window.location.href = "checkout.html";

    });
}


// ========================================
// جست‌وجو و فیلتر محصولات
// ========================================

if (productSearch) {
    productSearch.addEventListener("input", renderProducts);
}

if (categoryFilter) {
    categoryFilter.addEventListener("change", renderProducts);
}

if (priceSort) {
    priceSort.addEventListener("change", renderProducts);
}


// ========================================
// به‌روزرسانی اطلاعات هنگام تغییر پنل مدیریت
// ========================================




// ========================================
// اجرای اولیه
// ========================================

loadProductsFromServer();