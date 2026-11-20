const CART_KEY = "lunaCart";

const params = new URLSearchParams(window.location.search);
const productId = params.get("id");

const content = document.getElementById("productContent");

let selectedProduct = null;
let selectedQuantity = 1;
let selectedImageIndex = 0;


// دریافت محصول از پایگاه داده سرور
async function getProductFromServer(id) {
    const response = await fetch(`/api/products/${encodeURIComponent(id)}`, { cache: "no-store" });
    if (!response.ok) return null;
    return response.json();
}

// تبدیل قیمت به نمایش فارسی
function formatPrice(price) {
    return Number(price || 0).toLocaleString("fa-IR") + " تومان";
}


// نمایش پیام محصول ناموجود
function showNotFound() {
    content.innerHTML = `
        <div class="not-found">
            <h2>محصول پیدا نشد!</h2>
            <p>ممکن است این محصول حذف شده باشد.</p>
            <a href="index.html" class="back-link">
                بازگشت به فروشگاه
            </a>
        </div>
    `;
}


// ساخت گالری تصاویر
function getProductImages(product) {
    const images = Array.isArray(product.images)
        ? product.images.filter(image => typeof image === "string" && image.trim())
        : [];

    if (product.image && !images.includes(product.image)) {
        images.unshift(product.image);
    }

    return [...new Set(images)];
}


// نمایش صفحه محصول
async function renderProduct() {
    content.textContent = "در حال دریافت اطلاعات محصول...";
    try {
        selectedProduct = productId ? await getProductFromServer(productId) : null;
    } catch (error) {
        console.error("خطا در دریافت محصول:", error);
        content.textContent = "دریافت اطلاعات محصول با مشکل مواجه شد. صفحه را دوباره بارگذاری کنید.";
        return;
    }

    if (!selectedProduct) {
        showNotFound();
        return;
    }

    const product = selectedProduct;
    const images = getProductImages(product);

    selectedImageIndex = 0;
    selectedQuantity = 1;

    const mainImage = images[0] || "";

    content.innerHTML = `
        <div class="detail-layout">

            <section class="gallery">

                ${mainImage
            ? `
                            <img
                                id="mainImage"
                                class="main-image"
                                src="${escapeHTML(mainImage)}"
                                alt="${escapeHTML(product.name)}"
                            >
                        `
            : `
                            <div class="main-image"
                                 style="display:flex;align-items:center;justify-content:center;">
                                تصویری برای این محصول ثبت نشده است.
                            </div>
                        `
        }

                <div class="thumbnail-list" id="thumbnailList">
                    ${images.map((image, index) => `
                        <img
                            class="thumbnail ${index === 0 ? "active" : ""}"
                            src="${escapeHTML(image)}"
                            alt="تصویر ${index + 1}"
                            data-index="${index}"
                        >
                    `).join("")}
                </div>

            </section>

            <section class="product-details">

                <h1>${escapeHTML(product.name)}</h1>

                <div class="detail-price">
                    ${formatPrice(product.price)}
                </div>

                <div class="detail-meta">
                    <div>
                        دسته‌بندی:
                        <span>${escapeHTML(categoryNames[product.category] || "عمومی")}</span>
                    </div>

                    <div>
                        وضعیت موجودی:
                        <span>
                            ${Number(product.stock) > 0
            ? "موجود"
            : "ناموجود"
        }
                        </span>
                    </div>
                </div>

                <div class="detail-description">
                    ${escapeHTML(
            product.description || "توضیحاتی برای این محصول ثبت نشده است."
        )
        }
                </div>

                <div class="quantity-box">
                    <span>تعداد:</span>

                    <button id="decreaseQuantity" type="button">−</button>

                    <strong id="quantityValue">۱</strong>

                    <button id="increaseQuantity" type="button">+</button>
                </div>

                <button
                    id="addToCartDetail"
                    class="add-cart-detail"
                    type="button"
                    ${Number(product.stock) <= 0 ? "disabled" : ""}
                >
                    ${Number(product.stock) > 0
            ? "افزودن به سبد خرید"
            : "ناموجود"
        }
                </button>

                <p id="detailMessage" class="detail-message"></p>

            </section>

        </div>
    `;

    setupGallery(images);
    setupQuantity();
}


// جلوگیری از تفسیر متن محصول به‌عنوان HTML
function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => {
        const entities = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        };

        return entities[character];
    });
}


// تغییر عکس اصلی با انتخاب تصاویر کوچک
function setupGallery(images) {
    const thumbnails = document.querySelectorAll(".thumbnail");
    const mainImage = document.getElementById("mainImage");

    thumbnails.forEach(thumbnail => {
        thumbnail.addEventListener("click", () => {
            const index = Number(thumbnail.dataset.index);

            selectedImageIndex = index;

            if (mainImage) {
                mainImage.src = images[index];
            }

            thumbnails.forEach(item => {
                item.classList.remove("active");
            });

            thumbnail.classList.add("active");
        });
    });
}


// انتخاب تعداد محصول
function setupQuantity() {
    const decreaseButton = document.getElementById("decreaseQuantity");
    const increaseButton = document.getElementById("increaseQuantity");
    const quantityValue = document.getElementById("quantityValue");
    const addButton = document.getElementById("addToCartDetail");

    const stock = Math.max(0, Number(selectedProduct.stock) || 0);

    decreaseButton.addEventListener("click", () => {
        if (selectedQuantity > 1) {
            selectedQuantity--;
            quantityValue.textContent =
                selectedQuantity.toLocaleString("fa-IR");
        }
    });

    increaseButton.addEventListener("click", () => {
        if (selectedQuantity < stock) {
            selectedQuantity++;
            quantityValue.textContent =
                selectedQuantity.toLocaleString("fa-IR");
        }
    });

    addButton.addEventListener("click", addProductToCart);
}


// افزودن محصول به سبد خرید
function addProductToCart() {
    const product = selectedProduct;
    const message = document.getElementById("detailMessage");

    if (!product || Number(product.stock) <= 0) {
        message.textContent = "این محصول موجود نیست.";
        return;
    }

    let cart = [];

    try {
        cart = JSON.parse(localStorage.getItem(CART_KEY)) || [];
    } catch {
        cart = [];
    }

    const existing = cart.find(item =>
        String(item.id ?? "") === String(product.id)
    );

    const currentQuantity = existing
        ? Number(existing.quantity) || 0
        : 0;

    if (currentQuantity + selectedQuantity > Number(product.stock)) {
        message.textContent = "تعداد انتخاب‌شده بیشتر از موجودی محصول است.";
        return;
    }

    if (existing) {
        existing.quantity += selectedQuantity;
    } else {
        cart.push({
            id: String(product.id),
            name: product.name,
            price: Number(product.price) || 0,
            quantity: selectedQuantity,
            image: product.image || ""
        });
    }

    localStorage.setItem(CART_KEY, JSON.stringify(cart));

    message.textContent = "محصول به سبد خرید اضافه شد! ✓";
}


// اجرای اولیه
renderProduct();