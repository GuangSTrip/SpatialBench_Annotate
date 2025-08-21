#!/usr/bin/env python3
"""
验证统计按钮位置
"""

import requests
from bs4 import BeautifulSoup

def test_button_position():
    """验证统计按钮位置"""
    base_url = "http://localhost:5001"
    
    print("🧪 验证统计按钮位置...")
    
    try:
        # 获取页面HTML
        response = requests.get(base_url)
        if response.status_code == 200:
            soup = BeautifulSoup(response.content, 'html.parser')
            
            # 查找标题
            title = soup.find('h1', class_='logo')
            if title:
                print(f"✅ 找到标题: {title.get_text(strip=True)}")
            else:
                print("❌ 未找到标题")
                return
            
            # 查找统计按钮
            stats_button = soup.find('button', class_='statistics-btn')
            if stats_button:
                print(f"✅ 找到统计按钮: {stats_button.get_text(strip=True)}")
            else:
                print("❌ 未找到统计按钮")
                return
            
            # 查找创作者和创作时间
            year = soup.find('span', class_='year')
            producer = soup.find('span', class_='producer')
            
            if year:
                print(f"✅ 找到创作时间: {year.get_text(strip=True)}")
            if producer:
                print(f"✅ 找到创作者: {producer.get_text(strip=True)}")
            
            # 检查HTML结构顺序
            header_content = soup.find('div', class_='header-content')
            if header_content:
                children = list(header_content.children)
                print(f"\n📋 页面元素顺序:")
                
                for i, child in enumerate(children):
                    if child.name:
                        if 'logo' in child.get('class', []):
                            print(f"   {i+1}. 标题 (logo)")
                        elif 'statistics-btn' in child.get('class', []):
                            print(f"   {i+1}. 统计按钮")
                        elif 'header-info' in child.get('class', []):
                            print(f"   {i+1}. 创作者和创作时间 (header-info)")
                        else:
                            print(f"   {i+1}. {child.name} ({' '.join(child.get('class', []))})")
                
                # 验证顺序
                logo_index = -1
                stats_index = -1
                info_index = -1
                
                for i, child in enumerate(children):
                    if child.name:
                        if 'logo' in child.get('class', []):
                            logo_index = i
                        elif 'statistics-btn' in child.get('class', []):
                            stats_index = i
                        elif 'header-info' in child.get('class', []):
                            info_index = i
                
                if logo_index != -1 and stats_index != -1 and info_index != -1:
                    if logo_index < stats_index < info_index:
                        print("\n✅ 元素顺序正确: 标题 -> 统计按钮 -> 创作者和创作时间")
                    else:
                        print(f"\n❌ 元素顺序不正确:")
                        print(f"   标题位置: {logo_index + 1}")
                        print(f"   统计按钮位置: {stats_index + 1}")
                        print(f"   创作者和创作时间位置: {info_index + 1}")
                else:
                    print("\n❌ 无法确定所有元素位置")
                    
            else:
                print("❌ 未找到header-content")
                
        else:
            print(f"❌ 页面请求失败: {response.status_code}")
            return
            
    except Exception as e:
        print(f"❌ 测试失败: {e}")
        return
    
    print("\n🎉 统计按钮位置验证完成！")
    print("\n📝 期望的布局:")
    print("   标题 -> 统计按钮 -> 创作者和创作时间")

if __name__ == "__main__":
    test_button_position()
