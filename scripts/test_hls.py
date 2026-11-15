import importlib.util
import unittest
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('hls',Path(__file__).with_name('build-hls-evidence.py'))
hls=importlib.util.module_from_spec(spec);spec.loader.exec_module(hls)
class QualityTests(unittest.TestCase):
    def test_all_quality_bits(self):
        for value,label in [(2,'cloud'),(4,'adjacent_cloud_shadow'),(8,'shadow'),(16,'snow'),(32,'water'),(192,'high_aerosol'),(255,'fill')]:
            result=hls.pixel(value,[2000,6000,3000,2000]);self.assertIsNone(result['ndvi']);self.assertIn(label,result['excluded'])
    def test_scale_fill_zero_and_denominator(self):
        self.assertAlmostEqual(hls.pixel(0,[2000,6000,3000,2000])['ndvi'],0.5)
        self.assertEqual(hls.pixel(64,[2000,2000,3000,2000])['ndvi'],0)
        self.assertEqual(hls.pixel(128,[2000,2000,3000,2000])['reflectance'][0],0.2)
        for raw in [[-9999,5000,3000,2000],[0,0,3000,2000],[None,5000,3000,2000]]:
            self.assertIsNone(hls.pixel(0,raw)['ndvi'])
    def test_asset_host_restriction(self):
        with patch.object(hls.requests,'get') as get:
            with self.assertRaises(ValueError):hls.read_band('https://evil.example/image.tif','test-token',38,-100)
            get.assert_not_called()
if __name__=='__main__':unittest.main()
