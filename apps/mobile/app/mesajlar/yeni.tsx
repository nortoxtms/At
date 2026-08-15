import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Txt } from '@/components/Text';
import { BackButton, Card, EmptyState, Field, Loading } from '@/components/ui';
import { api } from '@/lib/api';
import { getListing } from '@/lib/catalog';
import { formatPrice } from '@/lib/format';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/useAsync';
import { theme } from '@/theme/tokens';

/**
 * Writing the first message about a listing (§16).
 *
 * Pre-filled, and that is not a nicety. A first enquiry that says only
 * "merhaba" gets no reply, and a seller with thirty of them stops opening the
 * inbox. The draft names the horse and asks the two questions that actually
 * start a conversation — the text is editable, so a person who knows what to
 * ask is not made to delete boilerplate first.
 *
 * §12's POST /conversations takes the counterparty's profile id, not the
 * listing's. The seller comes from the listing record, so this screen cannot
 * open without one — which is correct: §16 has no "message a stranger about
 * nothing" path, every thread is about something.
 */
export default function NewMessageScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { me } = useSession();
  const { listing: slug } = useLocalSearchParams<{ listing?: string }>();

  const { data, loading } = useAsync(
    () => (slug ? getListing(String(slug)) : Promise.resolve(null)),
    [slug],
  );

  const listing = data?.data ?? null;
  const sellerId = (listing as { seller_profile_id?: string } | null)?.seller_profile_id ?? null;

  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [primed, setPrimed] = useState(false);

  if (loading) return <Loading />;

  if (listing && !primed) {
    setPrimed(true);
    setBody(
      `Merhaba, ${listing.horse_name} ile ilgileniyorum. Görmeye gelebileceğim uygun bir gün var mı? ` +
        `Sağlık kaydını ve varsa röntgenlerini de paylaşabilir misiniz?`,
    );
  }

  const send = async () => {
    if (!sellerId) return;

    setSending(true);
    setError(null);

    const result = await api<{ conversationId: string; messageId: string }>('/conversations', {
      method: 'POST',
      body: JSON.stringify({
        contextType: 'listing',
        contextId: listing?.id,
        participantId: sellerId,
        firstMessage: body.trim(),
      }),
    });

    setSending(false);

    if (!result.ok) {
      setError(result.error.message);
      return;
    }

    router.replace(`/mesajlar/${result.data.conversationId}`);
  };

  if (!me) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.color.bg, justifyContent: 'center', padding: theme.screenPadding }}>
        <EmptyState
          icon="person-outline"
          title="Önce giriş yap"
          body="Mesaj göndermek için hesabına girmen gerekiyor."
          action={<Button label="Giriş yap" full={false} onPress={() => router.replace('/auth')} />}
        />
      </View>
    );
  }

  if (!listing || !sellerId) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.color.bg, justifyContent: 'center', padding: theme.screenPadding }}>
        <EmptyState
          icon="chatbubble-outline"
          title="Konuşma bir ilandan başlar"
          body="İlgilendiğin ilanı aç ve oradan satıcıya yaz."
          action={
            <Button label="İlanlara bak" full={false} onPress={() => router.replace('/(tabs)/ara')} />
          }
        />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.color.bg }}
      contentContainerStyle={{
        paddingTop: insets.top,
        paddingHorizontal: theme.screenPadding,
        paddingBottom: theme.space.xxxl,
        gap: theme.space.lg,
      }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <BackButton onPress={() => router.back()} />
        <Txt variant="screenTitle" uppercase>
          Satıcıya yaz
        </Txt>
        <View style={{ width: theme.metric.minTouchTarget }} />
      </View>

      <Card style={{ gap: 2 }}>
        <Txt variant="h3" numberOfLines={1}>
          {listing.horse_name}
        </Txt>
        <Txt variant="small" color={theme.color.textSecondary} display={false}>
          {listing.seller_name}
          {' · '}
          {formatPrice(listing.price_amount, listing.price_currency, listing.price_type)}
        </Txt>
      </Card>

      <Field
        label="Mesaj"
        value={body}
        onChangeText={setBody}
        multiline
        numberOfLines={8}
        style={{ minHeight: 200 }}
        hint="§16 — mesajlar moderasyondan geçer. İletişim bilgisi paylaşmadan önce satıcıyı tanı."
        error={error}
      />

      <Button
        label="Gönder"
        onPress={() => void send()}
        loading={sending}
        disabled={body.trim().length < 10}
      />
    </ScrollView>
  );
}
