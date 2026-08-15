import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Dimensions, Pressable, ScrollView, View } from 'react-native';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Text';
import { theme } from '@/theme/tokens';

/**
 * S02 — Onboarding.
 *
 * Three panels, and each one is a promise the product has to keep rather than
 * a feature list: the horse has a record, the record follows it, and the
 * people are verified. §1.3's P1 is that identity is the product and the
 * marketplace is downstream of it — an onboarding that opens with "buy and
 * sell horses" sells the wrong thing.
 *
 * Skippable from the first panel. §18.2 does not gate browsing on an account,
 * and an onboarding you cannot leave is a paywall wearing a carousel.
 */
const PANELS: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string }[] = [
  {
    icon: 'finger-print-outline',
    title: 'Her atın bir kimliği var',
    body: 'Doğumdan itibaren tek kayıt: soy, sağlık, sahiplik ve yarışma geçmişi tek yerde.',
  },
  {
    icon: 'git-branch-outline',
    title: 'Kayıt atla birlikte gider',
    body: 'At el değiştirdiğinde geçmişi de devrolur. Yeni sahip sıfırdan başlamaz.',
  },
  {
    icon: 'shield-checkmark-outline',
    title: 'Karşındaki kim, belli',
    body: 'İlan yayınlamak kimlik doğrulaması ister. Bu hiçbir planla satın alınamaz.',
  },
];

export default function Onboarding() {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const scroller = useRef<ScrollView>(null);
  const width = Dimensions.get('window').width;

  const done = () => router.replace('/(tabs)');

  const next = () => {
    if (index === PANELS.length - 1) return done();
    const target = index + 1;
    setIndex(target);
    scroller.current?.scrollTo({ x: target * width, animated: true });
  };

  return (
    <Screen padded={false}>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'flex-end',
          paddingHorizontal: theme.screenPadding,
        }}
      >
        <Pressable
          accessibilityRole="button"
          onPress={done}
          hitSlop={12}
          style={{ minHeight: theme.metric.minTouchTarget, justifyContent: 'center' }}
        >
          <Txt variant="small" color={theme.color.textSecondary} display={false}>
            Atla
          </Txt>
        </Pressable>
      </View>

      <ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(event) =>
          setIndex(Math.round(event.nativeEvent.contentOffset.x / width))
        }
        style={{ flex: 1 }}
      >
        {PANELS.map((panel) => (
          <View
            key={panel.title}
            style={{
              width,
              paddingHorizontal: theme.space.xxl,
              alignItems: 'center',
              justifyContent: 'center',
              gap: theme.space.xl,
            }}
          >
            <View
              style={{
                width: 96,
                height: 96,
                borderRadius: 48,
                backgroundColor: theme.color.surfaceRaised,
                borderWidth: 1,
                borderColor: theme.color.goldMuted,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name={panel.icon} size={40} color={theme.color.goldSoft} />
            </View>

            <Txt variant="display" align="center">
              {panel.title}
            </Txt>
            <Txt variant="body" align="center" color={theme.color.textSecondary} display={false}>
              {panel.body}
            </Txt>
          </View>
        ))}
      </ScrollView>

      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'center',
          gap: theme.space.sm,
          paddingBottom: theme.space.xl,
        }}
      >
        {PANELS.map((panel, dot) => (
          <View
            key={panel.title}
            style={{
              width: dot === index ? 20 : 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: dot === index ? theme.color.goldSoft : theme.color.goldMuted,
            }}
          />
        ))}
      </View>

      <View style={{ paddingHorizontal: theme.screenPadding, gap: theme.space.md, paddingBottom: theme.space.xl }}>
        <Button label={index === PANELS.length - 1 ? 'Başla' : 'Devam'} onPress={next} />
        <Button label="Hesabım var" variant="ghost" onPress={() => router.replace('/auth')} />
      </View>
    </Screen>
  );
}
