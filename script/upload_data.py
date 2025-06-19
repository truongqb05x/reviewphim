import pandas as pd
import mysql.connector

# Thông tin kết nối MySQL
config = {
    'host': 'localhost',
    'user': 'root',
    'password': '',  # hoặc mật khẩu nếu có
    'database': 'test'  # đổi tên theo bạn
}

# Đọc dữ liệu từ file Excel
df = pd.read_excel('D:\\review phim\\database\\data_reviewphim.xlsx')  # thay bằng tên file .xlsx của bạn

# Chuẩn hóa cột nếu thiếu tên phim
df['Tên phim'].fillna('Phim hay', inplace=True)

# Kết nối MySQL
conn = mysql.connector.connect(**config)
cursor = conn.cursor()

# Hàm lấy hoặc thêm tag nếu chưa có
def get_or_create_tag(tag_name):
    cursor.execute("SELECT id FROM tags WHERE name = %s", (tag_name,))
    result = cursor.fetchone()
    if result:
        return result[0]
    else:
        cursor.execute("INSERT INTO tags (name) VALUES (%s)", (tag_name,))
        conn.commit()
        return cursor.lastrowid

# Duyệt từng dòng và thêm vào bảng
for _, row in df.iterrows():
    video_url = row['URL Video']
    title = row['Tên phim']
    description = row['Tiêu Đề']
    the_loai = row['Thể loại']
    
    # Thêm vào bảng videos
    cursor.execute("""
        INSERT INTO videos (title, description, video_url)
        VALUES (%s, %s, %s)
    """, (title, description, video_url))
    conn.commit()
    video_id = cursor.lastrowid

    # Tách thể loại theo dấu gạch nối hoặc phẩy
    tag_names = [tag.strip() for tag in the_loai.replace(",", "-").split("-")]

    for tag_name in tag_names:
        tag_id = get_or_create_tag(tag_name)
        cursor.execute("""
            INSERT IGNORE INTO video_tags (video_id, tag_id) VALUES (%s, %s)
        """, (video_id, tag_id))
        conn.commit()

print("✅ Dữ liệu đã được chèn vào MySQL thành công!")
cursor.close()
conn.close()
