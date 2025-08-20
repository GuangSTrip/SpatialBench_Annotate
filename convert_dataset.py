#!/usr/bin/env python3
"""
数据集格式转换脚本
将现有JSON文件转换为符合系统要求的数据集格式
"""

import json
import os
import sys
from datetime import datetime
from typing import Dict, List, Any

class DatasetConverter:
    """数据集格式转换器"""
    
    def __init__(self):
        self.output_dir = "data"
        self.ensure_output_dir()
    
    def ensure_output_dir(self):
        """确保输出目录存在"""
        os.makedirs(self.output_dir, exist_ok=True)
    
    def convert_dataset(self, input_file: str, dataset_id: str, dataset_name: str, 
                       dataset_description: str = "", assigned_annotator: str = "annotator_1") -> Dict[str, Any]:
        """
        转换数据集格式
        
        Args:
            input_file: 输入JSON文件路径
            dataset_id: 数据集ID
            dataset_name: 数据集名称
            dataset_description: 数据集描述
            assigned_annotator: 分配的标注者ID
            
        Returns:
            转换后的数据集字典
        """
        try:
            # 读取输入文件
            with open(input_file, 'r', encoding='utf-8') as f:
                input_data = json.load(f)
            
            print(f"正在转换数据集: {dataset_name}")
            print(f"输入文件: {input_file}")
            
            # 转换数据
            converted_dataset = self._convert_to_dataset_format(
                input_data, dataset_id, dataset_name, dataset_description, assigned_annotator
            )
            
            return converted_dataset
            
        except FileNotFoundError:
            print(f"错误: 找不到输入文件 {input_file}")
            return None
        except json.JSONDecodeError as e:
            print(f"错误: JSON格式错误 - {e}")
            return None
        except Exception as e:
            print(f"错误: 转换失败 - {e}")
            return None
    
    def _convert_to_dataset_format(self, input_data: Any, dataset_id: str, dataset_name: str, 
                                  dataset_description: str, assigned_annotator: str) -> Dict[str, Any]:
        """
        将输入数据转换为数据集格式
        
        Args:
            input_data: 输入数据
            dataset_id: 数据集ID
            dataset_name: 数据集名称
            dataset_description: 数据集描述
            assigned_annotator: 分配的标注者ID
            
        Returns:
            转换后的数据集
        """
        # 创建基础数据集结构
        dataset = {
            "id": dataset_id,
            "name": dataset_name,
            "description": dataset_description or f"{dataset_name} 数据集",
            "created_at": datetime.now().isoformat(),
            "samples": []
        }
        
        # 根据输入数据格式进行转换
        if isinstance(input_data, list):
            # 如果输入是列表，每个元素作为一个样本
            samples = self._convert_list_to_samples(input_data, assigned_annotator)
        elif isinstance(input_data, dict):
            # 如果输入是字典，尝试提取样本信息
            samples = self._convert_dict_to_samples(input_data, assigned_annotator)
        else:
            print(f"警告: 不支持的输入数据类型: {type(input_data)}")
            samples = []
        
        dataset["samples"] = samples
        
        # 计算统计信息
        total_samples = len(samples)
        assigned_samples = len([s for s in samples if s.get("assigned_to")])
        
        dataset["sample_count"] = total_samples
        dataset["assigned_sample_count"] = assigned_samples
        
        return dataset
    
    def _convert_list_to_samples(self, data_list: List[Any], assigned_annotator: str) -> List[Dict[str, Any]]:
        """将列表数据转换为样本列表"""
        samples = []
        
        for i, item in enumerate(data_list):
            if isinstance(item, dict):
                # 如果列表元素是字典，尝试提取样本信息
                sample = self._extract_sample_from_dict(item, f"sample_{i+1}", assigned_annotator)
            else:
                # 如果列表元素是其他类型，创建默认样本
                sample = self._create_default_sample(f"sample_{i+1}", str(item), assigned_annotator)
            
            samples.append(sample)
        
        return samples
    
    def _convert_dict_to_samples(self, data_dict: Dict[str, Any], assigned_annotator: str) -> List[Dict[str, Any]]:
        """将字典数据转换为样本列表"""
        samples = []
        
        # 尝试从字典中提取样本信息
        if "samples" in data_dict:
            # 如果字典中有samples字段
            samples_data = data_dict["samples"]
            if isinstance(samples_data, list):
                for i, sample_data in enumerate(samples_data):
                    if isinstance(sample_data, dict):
                        sample = self._extract_sample_from_dict(sample_data, f"sample_{i+1}", assigned_annotator)
                    else:
                        sample = self._create_default_sample(f"sample_{i+1}", str(sample_data), assigned_annotator)
                    samples.append(sample)
            else:
                # 如果samples不是列表，将其作为单个样本
                sample = self._create_default_sample("sample_1", str(samples_data), assigned_annotator)
                samples.append(sample)
        else:
            # 如果字典中没有samples字段，将整个字典作为一个样本
            sample = self._extract_sample_from_dict(data_dict, "sample_1", assigned_annotator)
            samples.append(sample)
        
        return samples
    
    def _extract_sample_from_dict(self, data: Dict[str, Any], sample_id: str, assigned_annotator: str) -> Dict[str, Any]:
        """从字典中提取样本信息"""
        sample = {
            "id": sample_id,
            "name": data.get("name", f"样本 {sample_id}"),
            "type": self._determine_sample_type(data),
            "assigned_to": assigned_annotator,
            "review_status": "未审阅",
            "created_at": datetime.now().isoformat()
        }
        
        # 根据样本类型设置相应的字段
        if sample["type"] == "youtube":
            sample["youtube_url"] = data.get("youtube_url", "")
        elif sample["type"] == "single_video":
            sample["video_path"] = data.get("video_path", "")
        elif sample["type"] == "multiple_videos":
            sample["video_paths"] = data.get("video_paths", [])
        
        return sample
    
    def _create_default_sample(self, sample_id: str, content: str, assigned_annotator: str) -> Dict[str, Any]:
        """创建默认样本"""
        return {
            "id": sample_id,
            "name": f"样本 {sample_id}",
            "type": "single_video",
            "video_path": content,
            "assigned_to": assigned_annotator,
            "review_status": "未审阅",
            "created_at": datetime.now().isoformat()
        }
    
    def _determine_sample_type(self, data: Dict[str, Any]) -> str:
        """根据数据内容确定样本类型"""
        if "youtube_url" in data or "youtube" in data.get("type", "").lower():
            return "youtube"
        elif "video_paths" in data and isinstance(data["video_paths"], list) and len(data["video_paths"]) > 1:
            return "multiple_videos"
        else:
            return "single_video"
    
    def save_dataset(self, dataset: Dict[str, Any], output_filename: str = None) -> str:
        """
        保存转换后的数据集
        
        Args:
            dataset: 转换后的数据集
            output_filename: 输出文件名（可选）
            
        Returns:
            输出文件路径
        """
        if output_filename is None:
            output_filename = f"{dataset['id']}.json"
        
        output_path = os.path.join(self.output_dir, output_filename)
        
        try:
            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump(dataset, f, ensure_ascii=False, indent=2)
            
            print(f"✅ 数据集已保存到: {output_path}")
            return output_path
            
        except Exception as e:
            print(f"❌ 保存失败: {e}")
            return None
    
    def convert_and_save(self, input_file: str, dataset_id: str, dataset_name: str, 
                        dataset_description: str = "", assigned_annotator: str = "annotator_1",
                        output_filename: str = None) -> bool:
        """
        转换并保存数据集的便捷方法
        
        Args:
            input_file: 输入JSON文件路径
            dataset_id: 数据集ID
            dataset_name: 数据集名称
            dataset_description: 数据集描述
            assigned_annotator: 分配的标注者ID
            output_filename: 输出文件名（可选）
            
        Returns:
            是否成功
        """
        # 转换数据集
        dataset = self.convert_dataset(input_file, dataset_id, dataset_name, 
                                     dataset_description, assigned_annotator)
        
        if dataset is None:
            return False
        
        # 保存数据集
        output_path = self.save_dataset(dataset, output_filename)
        
        if output_path:
            print(f"\n🎉 转换完成！")
            print(f"📊 数据集统计:")
            print(f"   - 总样本数: {dataset['sample_count']}")
            print(f"   - 已分配样本数: {dataset['assigned_sample_count']}")
            print(f"   - 分配标注者: {assigned_annotator}")
            return True
        else:
            return False


def main():
    """主函数"""
    print("=" * 60)
    print("数据集格式转换工具")
    print("=" * 60)
    
    # 检查命令行参数
    if len(sys.argv) < 4:
        print("使用方法:")
        print("python convert_dataset.py <输入文件> <数据集ID> <数据集名称> [描述] [标注者ID]")
        print("\n示例:")
        print("python convert_dataset.py input.json my_dataset '我的数据集' '这是一个示例数据集' annotator_1")
        print("\n标注者ID选项:")
        print("  - annotator_1 (Hu Shutong)")
        print("  - annotator_2 (Wang Yu)")
        print("  - annotator_3 (Xiao Lijun)")
        print("  - annotator_4 (Zhao Yanguang)")
        print("  - unassigned (未分配)")
        return
    
    # 获取参数
    input_file = sys.argv[1]
    dataset_id = sys.argv[2]
    dataset_name = sys.argv[3]
    dataset_description = sys.argv[4] if len(sys.argv) > 4 else ""
    assigned_annotator = sys.argv[5] if len(sys.argv) > 5 else "annotator_1"
    
    # 验证输入文件
    if not os.path.exists(input_file):
        print(f"❌ 错误: 输入文件不存在: {input_file}")
        return
    
    # 验证标注者ID
    valid_annotators = ["annotator_1", "annotator_2", "annotator_3", "annotator_4", "unassigned"]
    if assigned_annotator not in valid_annotators:
        print(f"❌ 错误: 无效的标注者ID: {assigned_annotator}")
        print(f"有效的标注者ID: {', '.join(valid_annotators)}")
        return
    
    # 创建转换器并执行转换
    converter = DatasetConverter()
    success = converter.convert_and_save(
        input_file, dataset_id, dataset_name, 
        dataset_description, assigned_annotator
    )
    
    if success:
        print(f"\n✨ 转换成功完成！")
        print(f"📁 输出目录: {converter.output_dir}")
    else:
        print(f"\n💥 转换失败！请检查输入文件和参数。")


if __name__ == "__main__":
    main()
