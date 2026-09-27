import unittest
from frame_metrics import percentile,union_ms,sample_spans,summarize_trace


class FrameMetricsTests(unittest.TestCase):
    def test_nested_trace_spans_are_not_counted_twice(self):
        self.assertEqual(union_ms([(0,10000),(2000,4000),(8000,14000)],1000,12000),11)

    def test_native_work_is_attributed_to_the_calling_module(self):
        profile={'startTime':0,'nodes':[
            {'id':1,'callFrame':{'url':'https://game/js/map.js','functionName':'paint'},'children':[2]},
            {'id':2,'callFrame':{'url':'','functionName':'fill','scriptId':'0'}}],
            'samples':[2],'timeDeltas':[4000]}
        self.assertEqual(sample_spans(profile,['js/map.js']),[(0,4000,'js/map.js')])

    def test_cross_frame_sample_is_split_and_zero_sample_modules_remain(self):
        marks=[{'name':'nc-frame','ph':'I','pid':1,'tid':2,'ts':t} for t in [0,10000,20000]]
        trace=marks+[{'name':'Layout','ph':'X','pid':1,'tid':2,'ts':8000,'dur':5000},
                     {'name':'RasterTask','ph':'X','pid':1,'tid':3,'ts':5000,'dur':10000},
                     {'name':'RasterTask','ph':'X','pid':1,'tid':4,'ts':6000,'dur':2000}]
        profile={'startTime':0,'nodes':[{'id':1,'callFrame':{'url':'https://g/js/app.js','functionName':'frame'}}],
                 'samples':[1],'timeDeltas':[20000]}
        report=summarize_trace(trace,profile,['js/app.js','js/data.js'],[0,2,4])
        self.assertEqual([f['js_module_self_ms_estimate']['js/app.js'] for f in report['frames']],[10,10])
        self.assertEqual(report['modules']['js/data.js']['total_ms'],0)
        self.assertEqual([f['browser_ms']['layout'] for f in report['frames']],[2,3])
        self.assertEqual([f['browser_ms']['raster_workers'] for f in report['frames']],[7,5])
        self.assertEqual(report['fps'],100)
        self.assertEqual(report['frames'][0]['raf_timestamp_interval_ms'],2)

    def test_nearest_rank_percentiles_and_missing_trace_fail(self):
        self.assertEqual(percentile([1,2,3,90],.95),90)
        with self.assertRaises(ValueError):summarize_trace([],{},[],[])


if __name__=='__main__':unittest.main()
