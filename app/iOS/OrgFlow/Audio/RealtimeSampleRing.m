#import "RealtimeSampleRing.h"
#include <stdatomic.h>
#include <stdlib.h>
#include <string.h>

typedef struct {
    float *samples;
    int64_t capacity;
    _Atomic int64_t writeIndex;
    _Atomic int64_t readIndex;
} SampleRing;

static void SampleRingWrite(SampleRing *ring, const float *source, int64_t count) {
    int64_t w = atomic_load_explicit(&ring->writeIndex, memory_order_relaxed);
    int64_t r = atomic_load_explicit(&ring->readIndex, memory_order_acquire);
    int64_t space = ring->capacity - (w - r);
    int64_t n = count < space ? count : space;
    if (n <= 0) return;
    int64_t start = w % ring->capacity;
    int64_t first = n < ring->capacity - start ? n : ring->capacity - start;
    memcpy(ring->samples + start, source, (size_t)first * sizeof(float));
    if (n > first) memcpy(ring->samples, source + first, (size_t)(n - first) * sizeof(float));
    atomic_store_explicit(&ring->writeIndex, w + n, memory_order_release);
}

@implementation RealtimeSampleRing {
    SampleRing *_ring;
}

- (instancetype)initWithCapacity:(NSInteger)capacity {
    if ((self = [super init])) {
        _ring = calloc(1, sizeof(SampleRing));
        _ring->samples = calloc((size_t)capacity, sizeof(float));
        _ring->capacity = capacity;
        atomic_init(&_ring->writeIndex, 0);
        atomic_init(&_ring->readIndex, 0);
    }
    return self;
}

- (void)dealloc {
    free(_ring->samples);
    free(_ring);
}

- (AVAudioSinkNode *)makeSinkNode {
    // Capture the C struct, not self: no Objective-C messaging, locks or allocation on the I/O thread.
    // The node is owned by the capture controller, which also owns this ring, so the struct outlives the block.
    SampleRing *ring = _ring;
    return [[AVAudioSinkNode alloc] initWithRealtimeSafeReceiverBlock:^OSStatus(const AudioTimeStamp *timestamp, AVAudioFrameCount frameCount, const AudioBufferList *inputData) {
        if (inputData->mNumberBuffers > 0 && inputData->mBuffers[0].mData != NULL) {
            UInt32 available = inputData->mBuffers[0].mDataByteSize / (UInt32)sizeof(float);
            UInt32 frames = frameCount < available ? frameCount : available;
            SampleRingWrite(ring, (const float *)inputData->mBuffers[0].mData, frames);
        }
        return noErr;
    }];
}

- (NSInteger)readInto:(float *)destination maxCount:(NSInteger)maxCount {
    int64_t r = atomic_load_explicit(&_ring->readIndex, memory_order_relaxed);
    int64_t w = atomic_load_explicit(&_ring->writeIndex, memory_order_acquire);
    int64_t n = (int64_t)maxCount < w - r ? (int64_t)maxCount : w - r;
    if (n <= 0) return 0;
    int64_t start = r % _ring->capacity;
    int64_t first = n < _ring->capacity - start ? n : _ring->capacity - start;
    memcpy(destination, _ring->samples + start, (size_t)first * sizeof(float));
    if (n > first) memcpy(destination + first, _ring->samples, (size_t)(n - first) * sizeof(float));
    atomic_store_explicit(&_ring->readIndex, r + n, memory_order_release);
    return (NSInteger)n;
}

- (void)drain {
    atomic_store_explicit(&_ring->readIndex, atomic_load_explicit(&_ring->writeIndex, memory_order_acquire), memory_order_release);
}

@end
