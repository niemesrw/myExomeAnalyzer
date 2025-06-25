#!/usr/bin/env python3
"""
TileDB Array Maintenance Script
Consolidates fragments and vacuums arrays for optimal performance
"""

import tiledb
import os
import sys
import logging
from typing import List

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class TileDBMaintenance:
    def __init__(self, workspace_path: str):
        self.workspace_path = workspace_path
        
    def consolidate_array(self, array_name: str) -> bool:
        """Consolidate array fragments for better read performance"""
        array_path = os.path.join(self.workspace_path, array_name)
        
        if not os.path.exists(array_path):
            logger.error(f"Array {array_name} does not exist at {array_path}")
            return False
            
        try:
            logger.info(f"Consolidating fragments for array: {array_name}")
            
            # Consolidate fragments
            tiledb.consolidate(array_path)
            logger.info(f"Successfully consolidated {array_name}")
            
            # Vacuum consolidated fragments
            logger.info(f"Vacuuming consolidated fragments for: {array_name}")
            tiledb.vacuum(array_path)
            logger.info(f"Successfully vacuumed {array_name}")
            
            return True
            
        except Exception as e:
            logger.error(f"Error consolidating array {array_name}: {e}")
            return False
    
    def get_array_info(self, array_name: str) -> dict:
        """Get information about array fragments and size"""
        array_path = os.path.join(self.workspace_path, array_name)
        
        if not os.path.exists(array_path):
            return {"error": f"Array {array_name} does not exist"}
        
        try:
            # Get array size on disk
            total_size = 0
            fragment_count = 0
            
            for root, dirs, files in os.walk(array_path):
                for file in files:
                    file_path = os.path.join(root, file)
                    total_size += os.path.getsize(file_path)
                    
                    # Count fragment directories
                    if '__fragments' in root:
                        fragment_count += 1
            
            # Format size
            if total_size < 1024 * 1024:
                size_str = f"{total_size / 1024:.1f} KB"
            elif total_size < 1024 * 1024 * 1024:
                size_str = f"{total_size / (1024 * 1024):.1f} MB"
            else:
                size_str = f"{total_size / (1024 * 1024 * 1024):.1f} GB"
            
            # Get array schema info
            with tiledb.open(array_path) as array:
                schema = array.schema
                
                # Get attributes properly
                attr_count = len(list(schema))
                first_attr = list(schema)[0] if attr_count > 0 else None
                compression = str(first_attr.filters) if first_attr else "none"
                
                return {
                    "array_name": array_name,
                    "size_on_disk": size_str,
                    "size_bytes": total_size,
                    "fragment_count": fragment_count,
                    "array_type": "sparse" if schema.sparse else "dense",
                    "dimensions": len(schema.domain),
                    "attributes": attr_count,
                    "compression": compression
                }
                
        except Exception as e:
            return {"error": f"Error getting info for {array_name}: {e}"}
    
    def optimize_all_arrays(self) -> List[dict]:
        """Consolidate and optimize all arrays in workspace"""
        results = []
        
        if not os.path.exists(self.workspace_path):
            logger.error(f"Workspace does not exist: {self.workspace_path}")
            return results
        
        # Find all TileDB arrays in workspace
        for item in os.listdir(self.workspace_path):
            item_path = os.path.join(self.workspace_path, item)
            
            # Check if it's a TileDB array (has __schema directory)
            schema_dir = os.path.join(item_path, "__schema")
            if os.path.isdir(item_path) and os.path.exists(schema_dir):
                logger.info(f"Found TileDB array: {item}")
                
                # Get info before optimization
                before_info = self.get_array_info(item)
                
                # Consolidate array
                success = self.consolidate_array(item)
                
                # Get info after optimization
                after_info = self.get_array_info(item)
                
                results.append({
                    "array_name": item,
                    "success": success,
                    "before": before_info,
                    "after": after_info
                })
        
        return results
    
    def print_workspace_summary(self):
        """Print summary of all arrays in workspace"""
        print(f"\n🔧 TileDB Workspace Summary: {self.workspace_path}")
        print("=" * 80)
        
        if not os.path.exists(self.workspace_path):
            print("❌ Workspace does not exist")
            return
        
        total_size = 0
        array_count = 0
        
        for item in os.listdir(self.workspace_path):
            item_path = os.path.join(self.workspace_path, item)
            schema_dir = os.path.join(item_path, "__schema")
            
            if os.path.isdir(item_path) and os.path.exists(schema_dir):
                array_count += 1
                info = self.get_array_info(item)
                
                if "error" not in info:
                    print(f"📊 {info['array_name']}")
                    print(f"   Size: {info['size_on_disk']}")
                    print(f"   Type: {info['array_type']}")
                    print(f"   Dimensions: {info['dimensions']}")
                    print(f"   Attributes: {info['attributes']}")
                    print(f"   Fragments: {info['fragment_count']}")
                    print()
                    
                    total_size += info['size_bytes']
                else:
                    print(f"❌ {item}: {info['error']}")
        
        # Format total size
        if total_size < 1024 * 1024 * 1024:
            total_size_str = f"{total_size / (1024 * 1024):.1f} MB"
        else:
            total_size_str = f"{total_size / (1024 * 1024 * 1024):.1f} GB"
        
        print(f"📈 Total: {array_count} arrays, {total_size_str}")

def main():
    if len(sys.argv) < 2:
        print("Usage: python maintenance.py <workspace_path> [command]")
        print("Commands:")
        print("  info     - Show workspace information (default)")
        print("  optimize - Consolidate and optimize all arrays")
        print("  array <name> - Optimize specific array")
        sys.exit(1)
    
    workspace_path = sys.argv[1]
    command = sys.argv[2] if len(sys.argv) > 2 else "info"
    
    maintenance = TileDBMaintenance(workspace_path)
    
    if command == "info":
        maintenance.print_workspace_summary()
        
    elif command == "optimize":
        print("🔧 Optimizing all TileDB arrays...")
        results = maintenance.optimize_all_arrays()
        
        print("\n📊 Optimization Results:")
        print("=" * 80)
        for result in results:
            status = "✅" if result["success"] else "❌"
            print(f"{status} {result['array_name']}")
            
            if result["success"] and "error" not in result["before"] and "error" not in result["after"]:
                before_size = result["before"]["size_bytes"]
                after_size = result["after"]["size_bytes"]
                
                if before_size != after_size:
                    ratio = after_size / before_size if before_size > 0 else 1.0
                    print(f"   Size: {result['before']['size_on_disk']} → {result['after']['size_on_disk']} ({ratio:.2f}x)")
                else:
                    print(f"   Size: {result['after']['size_on_disk']} (no change)")
                
                print(f"   Fragments: {result['before']['fragment_count']} → {result['after']['fragment_count']}")
            print()
        
    elif command == "array" and len(sys.argv) > 3:
        array_name = sys.argv[3]
        print(f"🔧 Optimizing array: {array_name}")
        
        before_info = maintenance.get_array_info(array_name)
        success = maintenance.consolidate_array(array_name)
        after_info = maintenance.get_array_info(array_name)
        
        if success:
            print(f"✅ Successfully optimized {array_name}")
            if "error" not in before_info and "error" not in after_info:
                print(f"Size: {before_info['size_on_disk']} → {after_info['size_on_disk']}")
                print(f"Fragments: {before_info['fragment_count']} → {after_info['fragment_count']}")
        else:
            print(f"❌ Failed to optimize {array_name}")
    
    else:
        print(f"Unknown command: {command}")
        sys.exit(1)

if __name__ == "__main__":
    main()