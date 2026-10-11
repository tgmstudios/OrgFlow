#import <AVFAudio/AVFAudio.h>

NS_ASSUME_NONNULL_BEGIN

/// Lock-free single-producer/single-consumer ring of mono float samples, fed from the audio I/O thread.
/// The producer is a realtime-safe `AVAudioSinkNode` block written in C (Swift can't run on realtime threads).
@interface RealtimeSampleRing : NSObject

- (instancetype)initWithCapacity:(NSInteger)capacity NS_DESIGNATED_INITIALIZER;
- (instancetype)init NS_UNAVAILABLE;

/// A sink node whose realtime-safe receiver copies channel 0 into this ring. Overruns drop new samples.
- (AVAudioSinkNode *)makeSinkNode;

/// Consumer side. Returns the number of samples copied.
- (NSInteger)readInto:(float *)destination maxCount:(NSInteger)maxCount NS_SWIFT_NAME(read(into:maxCount:));

/// Consumer side: discards everything currently buffered.
- (void)drain;

@end

NS_ASSUME_NONNULL_END
