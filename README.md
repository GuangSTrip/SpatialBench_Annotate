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

## Run Tool

```bash
python app.py
```

访问: http://localhost:5001

## Quick Start

```bash
# 1. 克隆项目
git clone <your-repository-url>
cd Bench_Annotation_Tool

# 2. 创建环境
mamba create -n benchannot python=3.12
mamba activate benchannot

# 3. 安装依赖
pip install -r requirements.txt

# 4. 准备数据集
# 将数据集JSON文件放入 data/ 目录
# 例如: data/your_dataset.json

# 5. 运行工具
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

## Dataset Management

### Data Directory Structure

```
data/
├── .gitkeep                    # 保持目录结构
├── your_dataset.json          # 你的数据集文件
└── your_dataset_segments.json # 对应的片段文件（自动创建）
```

### Convert EgoExo4D Format

```bash
python convert_dataset.py egoexo4d.json egoexo4d "EgoExo4D Dataset"
```

### Add New Dataset

1. 将JSON数据集文件放入 `data/` 目录
2. 重启应用，系统会自动创建对应的segments文件
3. 开始标注工作

## Usage

### Annotators
- annotator_1: Hu Shutong
- annotator_2: Wang Yu  
- annotator_3: Xiao Lijun
- annotator_4: Zhao Yanguang

### Features
- Video playback and annotation
- Multi-view video support
- Segment creation and management
- Dataset import/export

## Configuration

Default port: 5001 (edit in `app.py` if needed)

## Troubleshooting

- **Port conflict**: Change port in `app.py` or kill existing process
- **YouTube download fails**: Check network and yt-dlp installation
- **Dataset not showing**: Verify JSON format and file locations
- **Video not playing**: Check file paths and browser support

## Development

Debug mode enabled by default. Edit `app.py` for configuration changes.

## Contributing

Issues and PRs welcome!

## License

[Add your license]
