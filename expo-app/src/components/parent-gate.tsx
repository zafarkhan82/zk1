import { useState } from 'react';
import { Linking, Modal, Pressable, TextInput, View } from 'react-native';

import { Button, H, T } from '@/components/ui';
import { Font } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Eltern-Abfrage vor dem Verlassen der App (externe Links, Anzeigen).
 * Kinder-App-Standard: eine Rechenaufgabe, die Kinder nicht nebenbei lösen.
 */
export function useParentGate() {
  const [url, setUrl] = useState<string | null>(null);
  const [task, setTask] = useState({ a: 7, b: 8 });
  const [answer, setAnswer] = useState('');
  const [onOk, setOnOk] = useState<(() => void) | null>(null);

  const open = (link: string, after?: () => void) => {
    setTask({ a: 6 + Math.floor(Math.random() * 4), b: 6 + Math.floor(Math.random() * 4) });
    setAnswer('');
    setUrl(link);
    setOnOk(() => after ?? null);
  };

  const close = () => setUrl(null);
  const ok = Number(answer.trim()) === task.a * task.b;

  const gate = (
    <ParentGateModal
      visible={!!url}
      task={task}
      answer={answer}
      setAnswer={setAnswer}
      ok={ok}
      onCancel={close}
      onConfirm={() => {
        const link = url;
        close();
        onOk?.();
        if (link) Linking.openURL(link);
      }}
    />
  );
  return { open, gate };
}

function ParentGateModal({
  visible,
  task,
  answer,
  setAnswer,
  ok,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  task: { a: number; b: number };
  answer: string;
  setAnswer: (v: string) => void;
  ok: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const theme = useTheme();
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onCancel}>
      <Pressable onPress={onCancel} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 }}>
        <Pressable onPress={() => {}} style={{ backgroundColor: theme.backgroundElement, borderRadius: 24, padding: 22, gap: 14, maxWidth: 420, width: '100%', alignSelf: 'center' }}>
          <H size={28}>Frag deine Eltern</H>
          <T size={14} color="textSecondary">
            Dieser Link führt aus Go4Pro heraus. Bitte gib das Handy kurz einem Erwachsenen.
          </T>
          <View style={{ gap: 6 }}>
            <T weight="700">
              Wie viel ist {task.a} × {task.b}?
            </T>
            <TextInput
              value={answer}
              onChangeText={setAnswer}
              keyboardType="number-pad"
              maxLength={3}
              placeholder="Ergebnis"
              placeholderTextColor={theme.textSecondary}
              accessibilityLabel="Ergebnis der Rechenaufgabe"
              style={{
                minHeight: 50,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: theme.border,
                paddingHorizontal: 14,
                color: theme.text,
                fontFamily: Font.bold,
                fontSize: 18,
                backgroundColor: theme.background,
              }}
            />
          </View>
          <Button title="Link öffnen" disabled={!ok} onPress={onConfirm} />
          <Button title="Abbrechen" variant="secondary" onPress={onCancel} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}
