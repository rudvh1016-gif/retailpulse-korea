import base64
import gzip
import importlib.util
import unittest
from pathlib import Path
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('parser','scripts/parse-transfer.py')
p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)

class ParserTest(unittest.TestCase):
    def raw(self,t='T1'):
        return gzip.decompress(base64.b64decode(Path('tests/fixtures/transfer/'+t+'-20260909.xls.gz.b64').read_text()))
    def test_official_files(self):
        self.assertEqual(p.parse(self.raw(),'2026-09-09','T1')['expectedTransferPassengers'],559)
        self.assertEqual(p.parse(self.raw('T2'),'2026-09-09','T2')['expectedTransferPassengers'],10485)
    def test_date(self):
        with self.assertRaisesRegex(ValueError,'wrong_service_date'):p.parse(self.raw(),'2026-09-10','T1')
    def test_terminal(self):
        with self.assertRaisesRegex(ValueError,'terminal'):p.parse(self.raw('T2'),'2026-09-09','T1')
    def mutated(self,r,c,value):
        raw=self.raw();book=p.xlrd.open_workbook(file_contents=raw);sheet=book.sheet_by_name('환승객예고')
        original=sheet.cell_value
        with patch.object(sheet,'cell_value',side_effect=lambda a,b: value if (a,b)==(r,c) else original(a,b)), patch.object(p.xlrd,'open_workbook',return_value=book):
            with self.assertRaises((ValueError,TypeError)):p.parse(raw,'2026-09-09','T1')
    def test_missing_header(self):self.mutated(7,0,'')
    def test_changed_schema(self):self.mutated(8,9,'새로운 합계')
    def test_malformed_value(self):self.mutated(10,9,'unknown')
    def test_no_zero_fallback(self):self.mutated(10,9,'')
    def test_inconsistent_total(self):self.mutated(10,9,560)
    def test_bad_workbook(self):
        with self.assertRaisesRegex(ValueError,'workbook_format'):p.parse(b'<html>error</html>','2026-09-09','T1')

unittest.main()
