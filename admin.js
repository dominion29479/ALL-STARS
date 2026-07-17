const adminOrderTable = document.getElementById('admin-orders');
const totalOrdersEl = document.getElementById('total-orders');
const pendingCountEl = document.getElementById('pending-count');
const fulfilledCountEl = document.getElementById('fulfilled-count');
const cancelledCountEl = document.getElementById('cancelled-count');
const refreshButton = document.getElementById('refresh-orders');
const orderSearchInput = document.getElementById('order-search');
const orderStatusFilter = document.getElementById('order-status-filter');
const productSearchInput = document.getElementById('product-search');
const productTable = document.getElementById('admin-products');
const addProductForm = document.getElementById('add-product-form');
const addLocationForm = document.getElementById('add-location-form');
const locationTable = document.getElementById('admin-locations');
const productOrderSummary = document.getElementById('product-order-summary');
const productSection = document.getElementById('product-management-section');
const revenueTotalEl = document.getElementById('revenue-total');
const lowStockCountEl = document.getElementById('low-stock-count');
const bestSellerNameEl = document.getElementById('best-seller-name');
const lowStockListEl = document.getElementById('low-stock-list');

const statusOptions = ['pending', 'fulfilled', 'cancelled'];
const API_BASE_URL = window.location.origin.includes('3000') ? window.location.origin : 'https://all-stars-1.onrender.com';

function createStatusPill(status) {
    const span = document.createElement('span');
    span.className = `status-pill status-${status}`;
    span.textContent = status || 'pending';
    return span;
}

function formatCurrency(amount) {
    return `₦${Number(amount || 0).toLocaleString()}`;
}

function createOrderRow(order) {
    const tr = document.createElement('tr');
    const created = new Date(order.created_at || order.createdAt || Date.now()).toLocaleString();
    const customerName = order.customer?.name || order.customer_name || 'Unknown';
    const customerEmail = order.customer?.email || order.customer_email || '—';
    const customerPhone = order.customer?.phone || order.customer_phone || '—';
    const customerLocation = order.customer?.address || order.customer_address || '—';
    const orderItems = Array.isArray(order.items) ? order.items : [];
    const productInfo = orderItems.length > 0
        ? orderItems.map((item) => `${item.name || 'Item'} × ${item.quantity || 1}`).join('<br>')
        : '—';
    const totalQty = orderItems.reduce((sum, item) => sum + Number(item.quantity || 1), 0);

    tr.innerHTML = `
        <td>${order.id}</td>
        <td>
            <strong>${customerName}</strong><br>
            <small>${customerEmail}</small><br>
            <small>${customerPhone}</small>
        </td>
        <td>${customerLocation}</td>
        <td>${productInfo}</td>
        <td>${totalQty}</td>
        <td>${formatCurrency(order.total)}</td>
        <td></td>
        <td>${created}</td>
        <td></td>
    `;

    const statusCell = tr.querySelector('td:nth-child(7)');
    const actionsCell = tr.querySelector('td:nth-child(9)');
    statusCell.appendChild(createStatusPill(order.status || 'pending'));

    const actions = document.createElement('div');
    actions.className = 'order-actions';

    statusOptions.forEach((status) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'update';
        button.textContent = status === order.status ? `Keep ${status}` : `Set ${status}`;
        button.addEventListener('click', () => updateOrderStatus(order.id, status));
        actions.appendChild(button);
    });

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'delete';
    deleteButton.textContent = 'Delete';
    deleteButton.addEventListener('click', () => deleteOrder(order.id));
    actions.appendChild(deleteButton);

    actionsCell.appendChild(actions);
    return tr;
}

function createProductRow(product) {
    const tr = document.createElement('tr');
    const stockStatus = Number(product.stock || 0) > 0 ? 'In stock' : 'Out of stock';
    const stockClass = Number(product.stock || 0) > 0 ? 'stock-in' : 'stock-out';
    tr.innerHTML = `
        <td>${product.id}</td>
        <td>${product.name}</td>
        <td>${product.description || ''}</td>
        <td>${formatCurrency(product.price)}</td>
        <td>${product.image || ''}</td>
        <td></td>
    `;

    const actionsCell = tr.querySelector('td:nth-child(6)');
    const actions = document.createElement('div');
    actions.className = 'order-actions';

    const stockButton = document.createElement('button');
    stockButton.type = 'button';
    stockButton.className = 'update';
    stockButton.textContent = Number(product.stock || 0) > 0 ? 'Mark out' : 'Mark in';
    stockButton.addEventListener('click', () => toggleProductStock(product.id, product));
    actions.appendChild(stockButton);

    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className = 'update';
    editButton.textContent = 'Edit';
    editButton.addEventListener('click', () => editProduct(product));
    actions.appendChild(editButton);

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'delete';
    deleteButton.textContent = 'Delete';
    deleteButton.addEventListener('click', () => deleteProduct(product.id));
    actions.appendChild(deleteButton);

    actionsCell.appendChild(actions);
    return tr;
}

let allOrders = [];
let allProducts = [];

function getFilteredOrders() {
    const query = String(orderSearchInput?.value || '').trim().toLowerCase();
    const status = String(orderStatusFilter?.value || 'all');
    return allOrders.filter((order) => {
        const customer = `${order.customer?.name || order.customer_name || ''} ${order.customer?.email || order.customer_email || ''}`.toLowerCase();
        const productText = Array.isArray(order.items) ? order.items.map((item) => item.name || '').join(' ').toLowerCase() : '';
        const matchesQuery = !query || customer.includes(query) || productText.includes(query);
        const matchesStatus = status === 'all' || String(order.status || 'pending') === status;
        return matchesQuery && matchesStatus;
    });
}

function getFilteredProducts() {
    const query = String(productSearchInput?.value || '').trim().toLowerCase();
    return allProducts.filter((product) => !query || `${product.name} ${product.description || ''}`.toLowerCase().includes(query));
}

function renderOrders(orders) {
    allOrders = Array.isArray(orders) ? orders : [];
    if (!adminOrderTable) return;
    const visibleOrders = getFilteredOrders();
    if (visibleOrders.length === 0) {
        adminOrderTable.innerHTML = '<tr><td colspan="9" style="color:#fff;">No orders found.</td></tr>';
        updateSummary(visibleOrders);
        return;
    }

    adminOrderTable.innerHTML = '';
    visibleOrders.forEach(order => adminOrderTable.appendChild(createOrderRow(order)));
    updateSummary(visibleOrders);
}

function renderProducts(products) {
    allProducts = Array.isArray(products) ? products : [];
    if (!productTable) return;
    const visibleProducts = getFilteredProducts();
    if (visibleProducts.length === 0) {
        productTable.innerHTML = '<tr><td colspan="6" style="color:#fff;">No products available.</td></tr>';
        return;
    }

    productTable.innerHTML = '';
    visibleProducts.forEach(product => productTable.appendChild(createProductRow(product)));
}

function createLocationRow(location) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td>${location.id}</td>
        <td>${location.name || ''}</td>
        <td>${location.address || ''}</td>
        <td>${location.phone || ''}</td>
        <td>${location.notes || ''}</td>
        <td></td>
    `;

    const actionsCell = tr.querySelector('td:nth-child(6)');
    const actions = document.createElement('div');
    actions.className = 'order-actions';

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'delete';
    deleteButton.textContent = 'Delete';
    deleteButton.addEventListener('click', () => deleteLocation(location.id));
    actions.appendChild(deleteButton);

    actionsCell.appendChild(actions);
    return tr;
}

function renderLocations(locations) {
    if (!locationTable) return;
    if (!Array.isArray(locations) || locations.length === 0) {
        locationTable.innerHTML = '<tr><td colspan="6" style="color:#fff;">No locations saved yet.</td></tr>';
        return;
    }

    locationTable.innerHTML = '';
    locations.forEach(location => locationTable.appendChild(createLocationRow(location)));
}

function renderProductOrderSummary(items) {
    if (!productOrderSummary) return;
    if (!Array.isArray(items) || items.length === 0) {
        productOrderSummary.innerHTML = '<tr><td colspan="3" style="color:#fff;">No product orders yet.</td></tr>';
        return;
    }

    productOrderSummary.innerHTML = '';
    items.forEach((item) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${item.name}</td>
            <td>${item.quantity}</td>
            <td>${formatCurrency(item.revenue)}</td>
        `;
        productOrderSummary.appendChild(tr);
    });
}

function updateSummary(orders) {
    const total = orders.length;
    const pending = orders.filter(o => o.status === 'pending').length;
    const fulfilled = orders.filter(o => o.status === 'fulfilled').length;
    const cancelled = orders.filter(o => o.status === 'cancelled').length;
    const revenue = orders
        .filter(o => String(o.status || 'pending').toLowerCase() === 'fulfilled')
        .reduce((sum, o) => sum + Number(o.total || 0), 0);

    const salesByProduct = {};
    orders.forEach((order) => {
        if (String(order.status || 'pending').toLowerCase() !== 'fulfilled') return;
        (Array.isArray(order.items) ? order.items : []).forEach((item) => {
            const key = item.name || 'Item';
            salesByProduct[key] = (salesByProduct[key] || 0) + Number(item.quantity || 1);
        });
    });

    const bestSeller = Object.entries(salesByProduct).sort((a, b) => b[1] - a[1])[0];

    if (totalOrdersEl) totalOrdersEl.textContent = total;
    if (pendingCountEl) pendingCountEl.textContent = pending;
    if (fulfilledCountEl) fulfilledCountEl.textContent = fulfilled;
    if (cancelledCountEl) cancelledCountEl.textContent = cancelled;
    if (revenueTotalEl) revenueTotalEl.textContent = formatCurrency(revenue);
    if (bestSellerNameEl) bestSellerNameEl.textContent = bestSeller ? bestSeller[0] : '—';

    const lowStockProducts = allProducts.filter((product) => Number(product.stock || 0) <= 1);
    if (lowStockCountEl) lowStockCountEl.textContent = lowStockProducts.length;
    if (lowStockListEl) {
        if (lowStockProducts.length === 0) {
            lowStockListEl.innerHTML = '<div class="low-stock-item">No low-stock products.</div>';
        } else {
            lowStockListEl.innerHTML = lowStockProducts.map((product) => `
                <div class="low-stock-item">
                    <span>${product.name}</span>
                    <strong>${Number(product.stock || 0) === 0 ? 'Out of stock' : 'Low stock'}</strong>
                </div>
            `).join('');
        }
    }
}

async function fetchOrders() {
    if (!adminOrderTable) return;
    adminOrderTable.innerHTML = '<tr><td colspan="9">Loading...</td></tr>';
    try {
        const response = await fetch(`${API_BASE_URL}/api/orders`);
        if (!response.ok) throw new Error('Unable to load orders');
        const orders = await response.json();
        renderOrders(orders);
    } catch (err) {
        adminOrderTable.innerHTML = `<tr><td colspan="9" style="color:#fff;">Error loading orders: ${err.message}</td></tr>`;
    }
}

async function fetchProducts() {
    if (!productTable) return;
    productTable.innerHTML = '<tr><td colspan="6">Loading...</td></tr>';
    try {
        const response = await fetch(`${API_BASE_URL}/api/products`);
        if (!response.ok) throw new Error('Unable to load products');
        const products = await response.json();
        renderProducts(products);
    } catch (err) {
        productTable.innerHTML = `<tr><td colspan="6" style="color:#fff;">Error loading products: ${err.message}</td></tr>`;
    }
}

async function fetchLocations() {
    if (!locationTable) return;
    locationTable.innerHTML = '<tr><td colspan="6">Loading...</td></tr>';
    try {
        const response = await fetch(`${API_BASE_URL}/api/locations`);
        if (!response.ok) throw new Error('Unable to load locations');
        const locations = await response.json();
        renderLocations(locations);
    } catch (err) {
        locationTable.innerHTML = `<tr><td colspan="6" style="color:#fff;">Error loading locations: ${err.message}</td></tr>`;
    }
}

async function fetchProductOrderSummary() {
    if (!productOrderSummary) return;
    productOrderSummary.innerHTML = '<tr><td colspan="3">Loading...</td></tr>';
    try {
        const response = await fetch(`${API_BASE_URL}/api/products/orders`);
        if (!response.ok) throw new Error('Unable to load product order summary');
        const items = await response.json();
        renderProductOrderSummary(items);
    } catch (err) {
        productOrderSummary.innerHTML = `<tr><td colspan="3" style="color:#fff;">Error loading summary: ${err.message}</td></tr>`;
    }
}

async function updateOrderStatus(orderId, status) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/orders/${orderId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
        if (!response.ok) throw new Error('Unable to update order');
        await fetchOrders();
    } catch (err) {
        alert(`Update failed: ${err.message}`);
    }
}

async function deleteOrder(orderId) {
    if (!confirm('Delete this order permanently?')) return;
    try {
        const response = await fetch(`${API_BASE_URL}/api/orders/${orderId}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('Unable to delete order');
        await fetchOrders();
    } catch (err) {
        alert(`Delete failed: ${err.message}`);
    }
}

async function toggleProductStock(productId, product) {
    const nextStock = Number(product.stock || 0) > 0 ? 0 : 1;
    try {
        const response = await fetch(`${API_BASE_URL}/api/products/${productId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ stock: nextStock })
        });
        if (!response.ok) throw new Error('Unable to update stock');
        await fetchProducts();
        try { localStorage.setItem('products_updated', String(Date.now())); } catch (e) { /* ignore */ }
    } catch (err) {
        alert(`Stock update failed: ${err.message}`);
    }
}

async function deleteProduct(productId) {
    if (!confirm('Delete this product permanently?')) return;
    try {
        const response = await fetch(`${API_BASE_URL}/api/products/${productId}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('Unable to delete product');
        await fetchProducts();
        await fetchProductOrderSummary();
        try { localStorage.setItem('products_updated', String(Date.now())); } catch (e) { /* ignore */ }
    } catch (err) {
        alert(`Delete failed: ${err.message}`);
    }
}

async function deleteLocation(locationId) {
    if (!confirm('Delete this location permanently?')) return;
    try {
        const response = await fetch(`${API_BASE_URL}/api/locations/${locationId}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('Unable to delete location');
        await fetchLocations();
    } catch (err) {
        alert(`Delete failed: ${err.message}`);
    }
}

function editProduct(product) {
    if (!addProductForm) return;
    addProductForm.dataset.editId = product.id;
    addProductForm.name.value = product.name;
    addProductForm.price.value = product.price;
    addProductForm.image.value = product.image;
    addProductForm.description.value = product.description || '';
    addProductForm.querySelector('button[type="submit"]').textContent = 'Update Product';
    productSection.scrollIntoView({ behavior: 'smooth' });
}

async function submitProductForm(event) {
    event.preventDefault();
    if (!addProductForm) return;

    const formData = new FormData(addProductForm);
    const name = String(formData.get('name') || '').trim();
    const price = Number(formData.get('price'));
    const image = String(formData.get('image') || 'images/placeholder.png').trim();
    const description = String(formData.get('description') || '').trim();
    const productId = addProductForm.dataset.editId;

    if (!name || !price) {
        alert('Name and price are required.');
        return;
    }

    const payload = { name, price, image, description, stock: 1 };
    const url = productId ? `${API_BASE_URL}/api/products/${productId}` : `${API_BASE_URL}/api/products`;
    const method = productId ? 'PATCH' : 'POST';

    try {
        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            const result = await response.json();
            throw new Error(result.error || 'Unable to save product');
        }
        addProductForm.reset();
        delete addProductForm.dataset.editId;
        addProductForm.querySelector('button[type="submit"]').textContent = 'Add Product';
        await fetchProducts();
        await fetchProductOrderSummary();
        try { localStorage.setItem('products_updated', String(Date.now())); } catch (e) { /* ignore */ }
    } catch (err) {
        alert(`Product save failed: ${err.message}`);
    }
}

async function submitLocationForm(event) {
    event.preventDefault();
    if (!addLocationForm) return;

    const formData = new FormData(addLocationForm);
    const payload = {
        name: String(formData.get('name') || '').trim(),
        address: String(formData.get('address') || '').trim(),
        phone: String(formData.get('phone') || '').trim(),
        notes: String(formData.get('notes') || '').trim()
    };

    if (!payload.name) {
        alert('Location name is required.');
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/locations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            const result = await response.json();
            throw new Error(result.error || 'Unable to save location');
        }
        addLocationForm.reset();
        await fetchLocations();
    } catch (err) {
        alert(`Location save failed: ${err.message}`);
    }
}

if (refreshButton) {
    refreshButton.addEventListener('click', fetchOrders);
}

if (orderSearchInput) {
    orderSearchInput.addEventListener('input', () => renderOrders(allOrders));
}

if (orderStatusFilter) {
    orderStatusFilter.addEventListener('change', () => renderOrders(allOrders));
}

if (productSearchInput) {
    productSearchInput.addEventListener('input', () => renderProducts(allProducts));
}

if (addProductForm) {
    addProductForm.addEventListener('submit', submitProductForm);
}

if (addLocationForm) {
    addLocationForm.addEventListener('submit', submitLocationForm);
}

document.addEventListener('DOMContentLoaded', () => {
    fetchOrders();
    fetchProducts();
    fetchLocations();
    fetchProductOrderSummary();
    fetchImagesList();
});

async function fetchImagesList() {
    try {
        const res = await fetch(`${API_BASE_URL}/api/images`);
        if (!res.ok) throw new Error('Unable to load images');
        const imgs = await res.json();
        populateImageSelect(imgs);
    } catch (err) {
        console.error('Failed to load images', err);
    }
}

function populateImageSelect(imgs) {
    const sel = document.getElementById('image-select');
    const input = document.getElementById('image');
    const preview = document.getElementById('image-preview');
    if (!sel) return;
    sel.innerHTML = '<option value="">— select image —</option>';
    imgs.forEach((i) => {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = i.split('/').pop();
        sel.appendChild(opt);
    });
    sel.addEventListener('change', (e) => {
        const v = e.target.value;
        if (input) input.value = v;
        if (preview) {
            if (v) { preview.src = v; preview.style.display = 'block'; }
            else { preview.style.display = 'none'; }
        }
    });
}

// image upload handling
async function uploadSelectedImage() {
    const fileInput = document.getElementById('image-file');
    const input = document.getElementById('image');
    const preview = document.getElementById('image-preview');
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        alert('Select a file to upload');
        return;
    }
    const file = fileInput.files[0];
    const fd = new FormData();
    fd.append('image', file);
    try {
        const res = await fetch(`${API_BASE_URL}/api/upload`, { method: 'POST', body: fd });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Upload failed');
        }
        const result = await res.json();
        if (input) input.value = result.path;
        if (preview) { preview.src = result.path; preview.style.display = 'block'; }
        // refresh image list
        await fetchImagesList();
        alert('Image uploaded successfully');
    } catch (err) {
        alert(`Upload failed: ${err.message}`);
    }
}

const uploadBtn = document.getElementById('upload-image-btn');
if (uploadBtn) uploadBtn.addEventListener('click', uploadSelectedImage);

// Add logout control to admin page
function addLogoutButton() {
    const nav = document.querySelector('header nav');
    if (!nav) return;
    const btn = document.createElement('button');
    btn.textContent = 'Logout';
    btn.style.marginLeft = '12px';
    btn.addEventListener('click', () => {
        sessionStorage.removeItem('admin_logged');
        window.location.href = '/admin-login.html';
    });
    nav.appendChild(btn);
}

addLogoutButton();
