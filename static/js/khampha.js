        // Hàm lấy danh sách thể loại từ API
        async function fetchCategories() {
            try {
                const response = await fetch('/api/tags');
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(`Không thể tải danh sách thể loại: ${response.status} - ${JSON.stringify(errorData)}`);
                }
                const categories = await response.json();
                renderCategories(categories);
            } catch (error) {
                console.error('Lỗi:', error);
                alert(error.message);
            }
        }

        function renderCategories(categories) {
    const container = document.getElementById('categoriesContainer');
    container.innerHTML = '';

    categories.forEach(category => {
        const card = document.createElement('div');
        card.className = 'category-card';
        
        const imageUrl = category.image_url || `https://source.unsplash.com/random/300x300/?${encodeURIComponent(category.name)},movie`;
        
        card.innerHTML = `
            <img src="${imageUrl}" class="category-bg">
            <div class="category-name">${category.name}</div>
        `;
        
        // Redirect to / instead of /index.html
        card.addEventListener('click', () => {
            window.location.href = `/?tag=${encodeURIComponent(category.name)}`;
        });
        
        container.appendChild(card);
    });
}
        // Gọi hàm khi trang tải
        window.onload = fetchCategories;
