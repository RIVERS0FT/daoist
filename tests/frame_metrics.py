"""Attribute recorded renderer intervals and V8 self-time samples to real frames.

CPU samples are estimates, never an exact partition of wall time. Raster/GPU
service work is reported separately because threads overlap each other.
"""
from bisect import bisect_right
from collections import defaultdict
from math import ceil


def percentile(values, fraction):
    return sorted(values)[max(0, ceil(len(values)*fraction)-1)] if values else 0


def union_ms(intervals, start, end):
    intervals=sorted((max(a,start),min(b,end)) for a,b in intervals if b>start and a<end)
    total=0;edge=start
    for a,b in intervals:
        total+=max(0,b-max(a,edge));edge=max(edge,b)
    return total/1000


def sample_spans(profile, modules):
    nodes={n['id']:n for n in profile['nodes']}
    parents={c:n['id'] for n in profile['nodes'] for c in n.get('children',[])}
    cache={};spans=[];time=profile['startTime']
    for ident,dt in zip(profile.get('samples',[]),profile.get('timeDeltas',[])):
        if ident not in cache:
            node=ident;key='browser/v8-unattributed'
            while node in nodes:
                frame=nodes[node]['callFrame'];url=frame.get('url','')
                match=next((m for m in modules if url.endswith('/'+m)),None)
                if match:key=match;break
                if frame['functionName']=='(idle)':key='browser/idle-sample';break
                if frame['functionName']=='(garbage collector)':key='browser/gc-sample';break
                if url or frame.get('scriptId','0')!='0':key='test/harness';break
                node=parents.get(node)
            cache[ident]=key
        spans.append((time,time+dt,cache[ident]));time+=dt
    return spans


def summarize_trace(trace, profile, modules, raf, budget_ms=1000/60):
    marks=sorted((e for e in trace if e['name']=='nc-frame' and e['ph'] in ('I','R')),key=lambda e:e['ts'])
    if len(marks)<3:raise ValueError('No frame markers in Chromium trace')
    main=(marks[0]['pid'],marks[0]['tid'])
    if len(marks)!=len(raf):raise ValueError('Trace frame markers and RAF samples disagree')
    categories={'style':{'UpdateLayoutTree','RecalculateStyles'},'layout':{'Layout'},
                'paint':{'PrePaint','Paint'},'composite':{'Layerize','CompositeLayers','Commit'},
                'main_busy':{'RunTask'},'raster_workers':{'RasterTask'},'gpu_service':{'GPUTask'}}
    intervals={key:[] for key in categories}
    # Keep parallel work split by thread, rather than summing overlapping nested
    # spans as if all of them occupied the renderer's main thread.
    parallel={key:defaultdict(list) for key in ('raster_workers','gpu_service')}
    for e in trace:
        if e.get('ph')!='X' or not e.get('dur'):continue
        for key,names in categories.items():
            if e['name'] not in names:continue
            span=(e['ts'],e['ts']+e['dur'])
            if key in parallel:parallel[key][(e['pid'],e['tid'])].append(span)
            elif (e['pid'],e['tid'])==main:intervals[key].append(span)
    spans=sample_spans(profile,modules);ends=[b for _,b,_ in spans]
    frames=[]
    for i,(mark,next_mark) in enumerate(zip(marks,marks[1:])):
        start,end=mark['ts'],next_mark['ts'];js={key:0.0 for key in modules}
        extras=defaultdict(float)
        for a,b,key in spans[bisect_right(ends,start):]:
            if a>=end:break
            ms=max(0,min(b,end)-max(a,start))/1000
            if key in js:js[key]+=ms
            else:extras[key]+=ms
        render={key:union_ms(value,start,end) for key,value in intervals.items() if key not in parallel}
        for key,threads in parallel.items():render[key]=sum(union_ms(v,start,end) for v in threads.values())
        frames.append({'index':i,'interval_ms':(end-start)/1000,'raf_timestamp_interval_ms':raf[i+1]-raf[i],
                       'js_module_self_ms_estimate':{k:round(v,4) for k,v in js.items()},
                       'sample_other_ms':dict(extras),'browser_ms':render})
    durations=[f['interval_ms'] for f in frames]
    module_summary={key:{'total_ms':round(sum(f['js_module_self_ms_estimate'][key] for f in frames),3),
                         'p95_frame_ms':round(percentile([f['js_module_self_ms_estimate'][key] for f in frames],.95),3),
                         'max_frame_ms':round(max(f['js_module_self_ms_estimate'][key] for f in frames),3)} for key in modules}
    browser_summary={key:{'total_ms':round(sum(f['browser_ms'][key] for f in frames),3),
                          'p95_frame_ms':round(percentile([f['browser_ms'][key] for f in frames],.95),3),
                          'max_frame_ms':round(max(f['browser_ms'][key] for f in frames),3)} for key in frames[0]['browser_ms']}
    return {'frames':frames,'modules':module_summary,'browser':browser_summary,
            'frame_count':len(frames),'fps':round(len(durations)*1000/sum(durations),2),
            'frame_ms':{k:round(v,3) for k,v in {'p50':percentile(durations,.5),'p95':percentile(durations,.95),'p99':percentile(durations,.99),'max':max(durations)}.items()},
            'over_budget_ratio':sum(t>budget_ms+.5 for t in durations)/len(durations),
            'long_frame_count':sum(t>50 for t in durations)}
