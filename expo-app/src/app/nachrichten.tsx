import { router } from 'expo-router';
import { View } from 'react-native';

import { NewsCard } from '@/components/home-cards';
import { useParentGate } from '@/components/parent-gate';
import { Button, Card, H, Screen, StripeHeader, T } from '@/components/ui';
import { useNews } from '@/lib/home';
import { useStore } from '@/lib/store';

export default function Nachrichten() {
  const { state, isAdmin, isStaff } = useStore();
  const { items, loaded } = useNews(state.profile?.id, 50);
  const { open, gate } = useParentGate();

  return (
    <Screen
      bottomBar={false}
      topInset={false}
      header={
        <StripeHeader height={150}>
          <H size={48}>Nachrichten</H>
          <T size={14} color="textSecondary">
            Von deinem Trainer-Team, deinem Verein und Go4Pro.
          </T>
        </StripeHeader>
      }>
      {(isAdmin || isStaff) && <Button title="Nachricht schreiben" variant="secondary" onPress={() => router.push('/nachricht-neu')} />}

      {loaded && items.length === 0 && (
        <Card>
          <T color="textSecondary">Noch keine Nachrichten. Sobald dein Trainer-Team oder dein Verein etwas schreibt, steht es hier.</T>
        </Card>
      )}

      <View style={{ gap: 10 }}>
        {items.map((n) => (
          <NewsCard key={n.id} item={n} onLink={(url) => open(url)} />
        ))}
      </View>

      <T size={12} color="textSecondary">
        In Go4Pro gibt es bewusst keinen Chat zwischen Kindern. Nachrichten schreiben nur Trainer*innen, Vereine und Go4Pro.
      </T>
      {gate}
    </Screen>
  );
}
