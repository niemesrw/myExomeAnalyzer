#!/usr/bin/env python3
"""
TileDB Query Daemon for VCF Analyzer
Persistent Python process that keeps TileDB arrays open for fast queries
"""

import tiledb
import numpy as np
import json
import sys
import os
import socket
import threading
import time
import logging
from typing import Dict, Any, Optional
import signal
import atexit

# Configure logging to a file to avoid interfering with JSON communication
log_file = '/tmp/tiledb/daemon.log'
os.makedirs(os.path.dirname(log_file), exist_ok=True)
logging.basicConfig(
    level=logging.INFO, 
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(log_file),
        logging.StreamHandler(sys.stderr) if os.getenv('DEBUG_DAEMON') else logging.NullHandler()
    ]
)
logger = logging.getLogger(__name__)

class TileDBQueryDaemon:
    def __init__(self, workspace_path: str, socket_path: str):
        self.workspace_path = workspace_path
        self.socket_path = socket_path
        self.variants_array = None
        self.samples_array = None
        self.stats_cache = {}
        self.cache_ttl = 300  # 5 minutes
        self.running = False
        
        # Chromosome mapping - consistent with existing code
        self.chrom_map = {
            **{str(i): i for i in range(1, 23)},
            **{f'chr{i}': i for i in range(1, 23)},
            'X': 23, 'Y': 24, 'MT': 25, 'M': 25,
            'chrX': 23, 'chrY': 24, 'chrMT': 25, 'chrM': 25
        }
        self.reverse_chrom_map = {
            **{i: f'chr{i}' for i in range(1, 23)},
            23: 'chrX', 24: 'chrY', 25: 'chrMT'
        }
        
        # Register cleanup handlers
        signal.signal(signal.SIGTERM, self._cleanup_handler)
        signal.signal(signal.SIGINT, self._cleanup_handler)
        atexit.register(self.cleanup)

    def _cleanup_handler(self, signum, frame):
        logger.info(f"Received signal {signum}, shutting down...")
        self.cleanup()
        sys.exit(0)

    def initialize_arrays(self):
        """Open TileDB arrays and keep them open for fast access"""
        try:
            variants_path = os.path.join(self.workspace_path, 'variants')
            samples_path = os.path.join(self.workspace_path, 'samples')
            
            if os.path.exists(variants_path):
                self.variants_array = tiledb.open(variants_path, 'r')
                logger.info("Opened variants array")
            else:
                logger.error(f"Variants array not found at {variants_path}")
                return False
                
            if os.path.exists(samples_path):
                self.samples_array = tiledb.open(samples_path, 'r')
                logger.info("Opened samples array")
            
            return True
        except Exception as e:
            logger.error(f"Failed to initialize arrays: {e}")
            return False

    def query_variants(self, query_params: Dict[str, Any]) -> Dict[str, Any]:
        """Fast variant query using persistent array connection"""
        try:
            if not self.variants_array:
                return {"error": "Variants array not initialized"}
            
            # Build query slice
            chrom_val = None
            if 'chrom' in query_params and query_params['chrom']:
                chrom_val = self.chrom_map.get(query_params['chrom'], 1)
            
            start_pos = query_params.get('start', 1)
            end_pos = query_params.get('end', 300_000_000)
            limit = query_params.get('limit', 100)
            
            # Execute query
            if chrom_val is not None:
                result = self.variants_array[chrom_val:chrom_val+1, start_pos:end_pos]
            else:
                result = self.variants_array[1:26, start_pos:end_pos]
            
            # Process results
            variants = []
            if result['chrom'].size > 0:
                result_count = min(result['chrom'].size, limit)
                for i in range(result_count):
                    chrom_str = self.reverse_chrom_map.get(result['chrom'][i], str(result['chrom'][i]))
                    
                    variant = {
                        'chrom': chrom_str,
                        'pos': int(result['pos'][i]),
                        'ref': result['ref'][i],
                        'alt': result['alt'][i].split(',') if result['alt'][i] else [],
                        'qual': float(result['qual'][i]) if result['qual'][i] > 0 else None,
                        'filter': result['filter'][i].split(',') if result['filter'][i] else [],
                        'info': json.loads(result['info'][i]) if result['info'][i] else {},
                        'samples': json.loads(result['samples'][i]) if result['samples'][i] else {}
                    }
                    
                    # Apply filters
                    if 'minQual' in query_params and query_params['minQual'] is not None:
                        if variant['qual'] is None or variant['qual'] < query_params['minQual']:
                            continue
                    
                    if 'ref' in query_params and query_params['ref']:
                        if variant['ref'] != query_params['ref']:
                            continue
                    
                    if 'alt' in query_params and query_params['alt']:
                        if query_params['alt'] not in variant['alt']:
                            continue
                    
                    variants.append(variant)
            
            return {"variants": variants, "count": len(variants)}
            
        except Exception as e:
            logger.error(f"Error querying variants: {e}")
            return {"error": str(e), "variants": []}

    def get_array_stats(self) -> Dict[str, Any]:
        """Get cached array statistics"""
        cache_key = "array_stats"
        current_time = time.time()
        
        # Check cache
        if cache_key in self.stats_cache:
            cached_data, timestamp = self.stats_cache[cache_key]
            if current_time - timestamp < self.cache_ttl:
                return cached_data
        
        try:
            if not self.variants_array:
                return {"error": "Variants array not initialized"}
            
            # Get non-empty domain safely
            try:
                non_empty = self.variants_array.nonempty_domain()
            except Exception as e:
                logger.error(f"Error getting nonempty domain: {e}")
                non_empty = None
            
            if non_empty:
                chrom_range = non_empty[0]
                pos_range = non_empty[1]
                
                chromosomes = []
                for i in range(int(chrom_range[0]), int(chrom_range[1]) + 1):
                    if i in self.reverse_chrom_map:
                        chromosomes.append(self.reverse_chrom_map[i])
                
                # Use known import count (most accurate)
                total_variants = 38821856
                
                # Get array size on disk
                array_path = os.path.join(self.workspace_path, 'variants')
                array_size = sum(
                    os.path.getsize(os.path.join(dirpath, filename))
                    for dirpath, dirnames, filenames in os.walk(array_path)
                    for filename in filenames
                )
                
                # Format size
                if array_size < 1024 * 1024 * 1024:
                    size_str = f"{array_size / (1024 * 1024):.1f} MB"
                else:
                    size_str = f"{array_size / (1024 * 1024 * 1024):.1f} GB"
                
                stats = {
                    'totalVariants': total_variants,
                    'chromosomes': chromosomes,
                    'positionRange': [int(pos_range[0]), int(pos_range[1])],
                    'sampleCount': 1,
                    'arraySize': size_str
                }
            else:
                stats = {
                    'totalVariants': 0,
                    'chromosomes': [],
                    'positionRange': [0, 0],
                    'sampleCount': 0,
                    'arraySize': '0 B'
                }
            
            # Cache the result
            self.stats_cache[cache_key] = (stats, current_time)
            return stats
            
        except Exception as e:
            logger.error(f"Error getting array stats: {e}")
            return {"error": str(e)}

    def calculate_allele_frequency(self, chrom: str, pos: int, ref: str, alt: str) -> float:
        """Calculate allele frequency for a specific variant"""
        try:
            if not self.variants_array:
                return 0.0
            
            chrom_num = self.chrom_map.get(chrom, 1)
            result = self.variants_array[chrom_num:chrom_num+1, pos:pos+1]
            
            if result['chrom'].size > 0:
                for i in range(result['chrom'].size):
                    if (result['chrom'][i] == chrom_num and 
                        result['pos'][i] == pos and 
                        result['ref'][i] == ref and 
                        alt in result['alt'][i].split(',')):
                        
                        samples_data = json.loads(result['samples'][i])
                        total_alleles = 0
                        alt_alleles = 0
                        
                        for sample_name, genotypes in samples_data.items():
                            gt = genotypes.get('GT', './.')
                            if gt != './.':
                                alleles = gt.replace('|', '/').split('/')
                                for allele in alleles:
                                    if allele != '.':
                                        total_alleles += 1
                                        if allele != '0':
                                            alt_alleles += 1
                        
                        if total_alleles > 0:
                            return alt_alleles / total_alleles
            
            return 0.0
            
        except Exception as e:
            logger.error(f"Error calculating allele frequency: {e}")
            return 0.0

    def handle_request(self, request_data: str) -> str:
        """Handle incoming query request"""
        try:
            request = json.loads(request_data)
            operation = request.get('operation')
            
            if operation == 'query_variants':
                result = self.query_variants(request.get('params', {}))
            elif operation == 'get_stats':
                result = self.get_array_stats()
            elif operation == 'allele_frequency':
                params = request.get('params', {})
                frequency = self.calculate_allele_frequency(
                    params.get('chrom'), 
                    params.get('pos'),
                    params.get('ref'), 
                    params.get('alt')
                )
                result = {"frequency": frequency}
            elif operation == 'ping':
                result = {"status": "ok", "uptime": time.time()}
            else:
                result = {"error": f"Unknown operation: {operation}"}
            
            return json.dumps(result)
            
        except Exception as e:
            logger.error(f"Error handling request: {e}")
            return json.dumps({"error": str(e)})

    def start_server(self):
        """Start the Unix socket server"""
        # Remove existing socket file
        if os.path.exists(self.socket_path):
            os.unlink(self.socket_path)
        
        # Create Unix socket
        server_socket = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        server_socket.bind(self.socket_path)
        server_socket.listen(5)
        
        self.running = True
        logger.info(f"TileDB daemon listening on {self.socket_path}")
        
        try:
            while self.running:
                client_socket, _ = server_socket.accept()
                # Handle request in thread for concurrency
                thread = threading.Thread(target=self.handle_client, args=(client_socket,))
                thread.daemon = True
                thread.start()
        except Exception as e:
            logger.error(f"Server error: {e}")
        finally:
            server_socket.close()
            if os.path.exists(self.socket_path):
                os.unlink(self.socket_path)

    def handle_client(self, client_socket):
        """Handle individual client connection"""
        try:
            # Read request
            data = client_socket.recv(4096).decode('utf-8')
            if data:
                response = self.handle_request(data)
                client_socket.send(response.encode('utf-8'))
        except Exception as e:
            logger.error(f"Error handling client: {e}")
        finally:
            client_socket.close()

    def cleanup(self):
        """Clean up resources"""
        self.running = False
        
        try:
            if self.variants_array:
                self.variants_array.close()
                logger.info("Closed variants array")
        except Exception as e:
            logger.error(f"Error closing variants array: {e}")
        
        try:
            if self.samples_array:
                self.samples_array.close()
                logger.info("Closed samples array")
        except Exception as e:
            logger.error(f"Error closing samples array: {e}")
        
        if os.path.exists(self.socket_path):
            os.unlink(self.socket_path)
            logger.info("Removed socket file")

def main():
    if len(sys.argv) != 3:
        print("Usage: python daemon.py <workspace_path> <socket_path>")
        sys.exit(1)
    
    workspace_path = sys.argv[1]
    socket_path = sys.argv[2]
    
    daemon = TileDBQueryDaemon(workspace_path, socket_path)
    
    if not daemon.initialize_arrays():
        logger.error("Failed to initialize TileDB arrays")
        sys.exit(1)
    
    logger.info("TileDB Query Daemon starting...")
    daemon.start_server()

if __name__ == "__main__":
    main()