# Bench Annotation Tool

视频标注工具，支持YouTube视频下载、多视角视频播放、片段标注和管理。

## Create Environment

```bash
# 使用conda/mamba创建环境（推荐）
mamba create -n benchannot python=3.12
mamba activate benchannot
```

## Install Dependencies

```bash
pip install -r requirements.txt
```
## Move Dataset JOSN File

```bash
mv egoexo4d.json data/egoexo4d.json
mv test_dataset.json data/test_dataset.json
```

## Login Huggingface

```bash
huggingface-cli login
```

## Run Tool

```bash
python app.py
```

访问: http://localhost:5001

## Project Structure

```
Bench_Annotation_Tool/
├── app.py                    # Flask应用
├── models/                   # 数据模型
├── static/                   # 静态资源
├── templates/                # HTML模板
├── data/                     # 数据文件
├── convert_dataset.py        # 数据集转换工具
└── requirements.txt          # 依赖包
```

## 其他
- 数据集信息以及标注信息存储在data文件夹下
- 由于数据源为video占用内容，故采取即下即用的方式，视频数据存储在static/videos文件夹下
