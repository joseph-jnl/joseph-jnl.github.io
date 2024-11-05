---
author: Joseph Lee
pubDatetime: 2024-11-04
title: Speeding up a multiarmed bandit by 30x
slug: slow-bandit
featured: true

tags:
  - bandits
  - profiler
  - flamegraphs
description: Speeding up an epsilon multi-armed bandit by over 30X using the excellent austin profiler and flamegraphs. 
---

## Slow Code

Step 1 of becoming a 30X bandit developer- write a very slow [implementation](https://github.com/joseph-jnl/rlbook/blob/dev/src/rlbook/bandits/algorithms.py) of an epsilon multiarmed bandit during your walkthrough of [Sutton & Barto](http://incompleteideas.net/book/the-book-2nd.html)'s Reinforcement Learning book.

To be clear, slow code can still very much be useful code:

* Implementing a quick yet unoptimized proof of concept now rather than later, particularly when the later often converges towards never, has a quality of its own. Perfect is the enemy of side project blog posts, so it goes.  
* Readability- although slow code doesn't guarantee readable code, I have a learned association between "optimized" code, holes in feet, and noodles hidden in the dark corners of boxes.

Slow is also relative. A single run of 1000 steps was timing in at 250 ms which seemed finetm at first glance. 

## Too Slow Code

So why are we still here as I sing praises of poorly optimized code?

* It turns out you rarely are rolling out a single episode in reinforcement learning. Even the most basic example of bandit performance across various epsilon values was averaged over 2000 runs.   
* Hyperparameter tuning, that great exponential rabbit hole and shaper of grad student's destinies. The search space for an epsilon bandit is relatively benign in the grand scheme of things (Epsilon: 0-1.0, Q Initialization Value: Optimistic vs Realistic (Zero), Alpha: Constant (0-1.0) vs Sample Average) but it quickly adds up.

My song quickly strikes a different tune when our slow code is approaching 10 minutes per single grid point\!

## Multiprocessing and Amdahl's Law

Luckily, bandit runs are independent and lend themselves well to a multiprocessing paradigm. I ended up using the [ProcessPoolExecutor](https://docs.python.org/3/library/concurrent.futures.html#concurrent.futures.ProcessPoolExecutor)[^1] class from the python standard concurrent.futures library to further abstract away some of the [setup](https://github.com/joseph-jnl/rlbook/blob/4726e971d9fd60d67691ffc62bc54d701801011f/src/rlbook/bandits/algorithms.py#L99-L123). 

Less fortunately, hardware limitations start to rear their ugly head. Probably (hopefully) not a concern in a work setting, where you'll have access to the full range of compute by your preferred, friendly neighborhood [cloud vendor](https://aws.amazon.com/ec2/instance-types/) (or even a beefy [on-prem rack](https://en.wikipedia.org/wiki/Beowulf_cluster)[^2]) but in the world of personal, side projects and a single, trusty but aging desktop, we start running into diminishing returns. Including Amdahl's Law.

A quick screen grab of the wandb dashboard for the sweep below (where `n_jobs` parameterized the number of parallel processes to spin up):   
\`\`\`bash  
`python run.py -m experiment.upload=true experiment.tag=cpu_profile run.steps=1000 run.n_runs=2000 run.n_jobs=1,2,3,4,5,6,7,8`  
\`\`\` 

\!\[\](https://github.com/user-attachments/assets/caf5cb0d-3ccc-488e-8c7b-08ad04de4daf)

and we can immediately observe:

1. Scaling from one to two processes nearly halves our original run time\!  
2. We quickly hit diminishing returns for each additional process, until there's really no further incremental gains at all.

Looks like we've hit [Amdahl's Law](https://en.wikipedia.org/wiki/Amdahl%27s_law):   
\> the overall performance improvement gained by optimizing a single part of a system is limited \> by the fraction of time that the improved part is actually used  
Parallel programming is hard.

## Profilers and Flamegraphs

Although multiprocessing ran its course, I thought there was probably quite a bit of head room for optimization and broke out the excellent [austin](https://github.com/P403n1x87/austin) profiler[^3] with output piped to [flamegraph](https://github.com/brendangregg/FlameGraph) (Note the `-C` flag to enable profiling child processes):  
\`\`\`bash  
`austin -C -i 1ms python run.py run.steps=1000 run.n_runs=20 | sed '/^#/d' | ~/projects/FlameGraph/flamegraph.pl --countname=μs > fg_v1_original.svg`  
```` ``` ````  
We can pretty easily pick out the 8 different process pool stacks running our bandits in parallel on the right side of the flamegraph.  
\!\[\](https://github.com/user-attachments/assets/63c57847-0d50-4491-8f88-c63e9a4dbce1)

A closer zoom into one of the individual process pools reveals something puzzling- our code is spending a lot of time (ie the length of the xaxis on a flamegraph will correlate to how long a particular portion of code runs based on how often it was sampled by the profiler) interacting with the omegaconf dictionary objects I used for [configuring](https://github.com/joseph-jnl/rlbook/blob/4726e971d9fd60d67691ffc62bc54d701801011f/experiments/ch2_bandits/run.py#L136) my experiment runs via [yaml](https://github.com/joseph-jnl/rlbook/blob/dev/experiments/ch2_bandits/configs/defaults.yaml) files and [hydra](https://hydra.cc/).  
\!\[\](https://github.com/user-attachments/assets/5550980b-814e-45f8-bb9e-085a0888cd35)

I didn't realize taking advantage of the hydra [class instantiation](https://hydra.cc/docs/1.1/advanced/instantiate_objects/overview/#internaldocs-banner) feature by default actually ports the omegaconf object rather than a pure python dict. Apparently this came with a significant amount of overhead as a simple 2 line change to convert to a simple python dict resulted in a large performance gain- what was taking over 100 seconds was now clocking in at less than 10:  
\!\[\](https://github.com/user-attachments/assets/15777d16-860a-4e48-9b21-421ef0a100f6)  
\!\[\]((https://github.com/user-attachments/assets/874bc5cd-49a6-4bb8-96ab-e7a76cb0fc43)

## Beware diligent fstrings

The bandit runs that were originally taking up the majority of the processing time were now comfortably taking a back seat to the actual setup (e.g. wandb) and package imports seen on the left hand side of the flamegraph.   
\!\[\](https://github.com/user-attachments/assets/3b5c05c3-3b1d-4230-84ab-43c810395c8c)

Zooming in again onto the top of the stack for a single process, it appeared that my home spun implementation of argmax (with its head scratching assortment of type conversion) was the next bottleneck to tackle.  
\!\[\](https://github.com/user-attachments/assets/96eef3bf-a8a1-467e-96d3-76b2f27b8c25)

\`\`\`python  
	def argmax(self, Q):  
    	"""Return max estimate Q, if tie between actions, choose at random between tied actions"""  
    	Q\_array \= np.array(list(self.Q.values()))  
    	At \= np.argwhere(Q\_array \== np.max(Q\_array)).flatten().tolist()

    	if len(At) \> 1:  
        	At \= np.random.choice(At)  
    	else:  
        	At \= At\[0\]

    	return list(Q.keys())\[At\]  
\`\`\`

Swapping it out for the numpy implementation of [argmax](https://numpy.org/doc/2.0/reference/generated/numpy.argmax.html) took some rearranging to consistently handle numpy arrays rather than an eclectic mix of lists, dicts, and pandas dataframes sprinkled throughout the codebase. The refactor was well worth it after seeing the final result of 3 time slower runs.

\!\[\](https://github.com/user-attachments/assets/aec20150-6241-43e1-afce-551f04935052)

Slower wasn't quite the direction I was aiming for here. Taking the profiler again, I noticed interesting references to printing arrays for some reason:  
\!\[\](https://github.com/user-attachments/assets/c63eba7b-88bb-465e-9dd3-16fe3b487b3f)

It turns out [fstrings in debug logging statements are not lazy.](https://google.github.io/styleguide/pyguide.html#3101-logging) I had added some additional logging while refactoring in the numpy array arrays which were apparently always evaluating even when not running the logger in DEBUG mode: \!\[\](https://github.com/user-attachments/assets/6ce4f82a-7163-4a3d-a7f4-2742bf278374)

## 30x Bandit

One last look through the profiler and our bandits are now humming along so fast that the process stacks are no longer even showing up as distinct stacks\! Most of what the flamegraph has sampled now consists of import statements rather than the actual bandit runs themselves, which seems like a good stopping point for our performance refactor as we've probably picked the low hanging fruit (and I want an excuse to go back to implementing rather than writing\!). 

\!\[\](https://github.com/user-attachments/assets/a9eb5ff6-b7de-46b1-841f-328c9deaeb26)

\!\[\](https://github.com/user-attachments/assets/06bebc4d-49c1-4a3a-be34-3b5caf340d01)

[^1]:  When to use a pool vs thread? I like the rule of thumb cited in this [stackoverflow thread](https://stackoverflow.com/questions/51828790/what-is-the-difference-between-processpoolexecutor-and-threadpoolexecutor), with the gist being "use threads for when I/O is the bottleneck, use pools when most of the processing is cpu bound. Even external libraries like Numpy that nominally run multithreaded can [sometimes](https://scipy-cookbook.readthedocs.io/items/ParallelProgramming.html) lock the GIL".

[^2]:  Beowulf clusters are more a relic of my shoestring academic budget past than anything you'd find in the office these days. Even back then, we were starting to hear about how "gaming cards" could be used instead for certain computational tasks and that we should all check out something called [CUDA](https://www.nvidia.com/en-us/on-demand/session/gtcspring22-s41487/).

[^3]:  What is profiling? Which profiler should you use? The author of the austin profiler has a great post [here](https://p403n1x87.github.io/deterministic-and-statistical-python-profiling.html).